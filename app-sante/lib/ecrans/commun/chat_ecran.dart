import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/temps_reel.dart';
import '../../core/donnees.dart';
import '../../core/e2ee.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../widgets/vocal.dart';

/// Conversation privée entre une famille et SON soignant, chiffrée de bout en bout :
/// texte, messages vocaux (pour ceux qui ne lisent pas), appel audio et appel vidéo.
/// Lisible sur tous les appareils du compte (clé sauvegardée chiffrée par le mot de passe).
class ChatEcran extends ConsumerStatefulWidget {
  const ChatEcran({super.key, required this.conversation});
  final Conversation conversation;
  @override
  ConsumerState<ChatEcran> createState() => _ChatEcranState();
}

class _ChatEcranState extends ConsumerState<ChatEcran> {
  final _texte = TextEditingController();
  final _scroll = ScrollController();
  final List<({String id, String moi, String? texte, Uint8List? audio, int? duree, DateTime? date})> _messages = [];
  Timer? _timer;
  StreamSubscription<Object?>? _abonnement;
  String? _cle;
  bool _envoi = false;
  String? _bloque; // la messagerie demande une reconnexion sur cet appareil

  @override
  void initState() {
    super.initState();
    _demarrer();
  }

  Future<void> _demarrer() async {
    try {
      await E2ee.instance.initialiser(ref.read(utilisateurProvider)!.id);
      _cle = widget.conversation.clePublique ??
          (await Api.instance.get('/users/${widget.conversation.interlocuteurId}/public-key'))['public_key'];
      if (mounted) setState(() {});
      await _charger();
      // Temps réel : rechargement immédiat à l'arrivée d'un message ; interrogation de secours toutes les 60 s
      _abonnement = TempsReel.instance.evenements
          .where((e) => e.type == 'message:nouveau' && e.donnees['conversation_id'] == widget.conversation.id)
          .listen((_) => _charger());
      _timer = Timer.periodic(const Duration(seconds: 60), (_) {
        // Pas de requête quand l'application est en arrière-plan (batterie)
        if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) _charger();
      });
    } catch (e) {
      if (!mounted) return;
      if (e is StateError) {
        setState(() => _bloque = e.message);
      } else {
        toast(context, messageErreur(e), erreur: true);
      }
    }
  }

  Future<void> _charger() async {
    if (_cle == null) return;
    final r = await Api.instance.get('/conversations/${widget.conversation.id}/messages');
    final liste = ((r['messages'] as List?) ?? []).map((m) => MessageChiffre.fromJson(Map<String, dynamic>.from(m))).toList();
    final connus = _messages.map((m) => m.id).toSet();
    var nouveau = false;
    for (final m in liste.where((m) => !connus.contains(m.id))) {
      if (m.audio) {
        final son = await E2ee.instance.dechiffrerOctets(m.ciphertext, m.nonce, _cle!, widget.conversation.id);
        _messages.add((id: m.id, moi: m.senderId, texte: son == null ? '🔒 Message vocal illisible' : null, audio: son, duree: m.duree, date: m.date));
      } else {
        final clair = await E2ee.instance.dechiffrer(m.ciphertext, m.nonce, _cle!, widget.conversation.id);
        _messages.add((id: m.id, moi: m.senderId, texte: clair, audio: null, duree: null, date: m.date));
      }
      nouveau = true;
    }
    if (nouveau && mounted) {
      setState(() {});
      await Api.instance.put('/conversations/${widget.conversation.id}/lu');
      ref.invalidate(conversationsProvider);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
      });
    }
  }

  Future<void> _envoyer() async {
    final t = _texte.text.trim();
    if (t.isEmpty || _cle == null) return;
    setState(() => _envoi = true);
    try {
      final c = await E2ee.instance.chiffrer(t, _cle!, widget.conversation.id);
      await Api.instance.post('/conversations/${widget.conversation.id}/messages', {'ciphertext': c.ciphertext, 'nonce': c.nonce});
      _texte.clear();
      await _charger();
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  /// Message vocal : enregistré, ramené à 8 kHz, chiffré sur l'appareil, puis envoyé
  Future<void> _vocal() async {
    if (_cle == null) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Message vocal pour ${widget.conversation.interlocuteurNom}',
                textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
            const SizedBox(height: 4),
            const Text('Lui seul pourra l’écouter.', style: TextStyle(color: C.texteDoux)),
            const SizedBox(height: 18),
            EnregistreurVocal(
              libelle: 'Appuyez, parlez, appuyez pour envoyer',
              onVocal: (v) async {
                final c = await E2ee.instance.chiffrerOctets(wav8kDepuis16k(v.octets), _cle!, widget.conversation.id);
                await Api.instance.post('/conversations/${widget.conversation.id}/messages', {
                  'type': 'AUDIO', 'duree_s': v.duree.inSeconds.clamp(1, 60), 'ciphertext': c.ciphertext, 'nonce': c.nonce,
                });
                if (ctx.mounted) Navigator.of(ctx).pop();
              },
            ),
          ]),
        ),
      ),
    );
    await _charger();
  }

  /// Appel audio ou vidéo : l'autre reçoit la sonnerie dans son application
  Future<void> _appeler(String mode) async {
    try {
      final r = await Api.instance.post('/conversations/${widget.conversation.id}/appels', {'mode': mode});
      if (!mounted) return;
      context.push(Uri(path: '/appel/${r['appel']['id']}', queryParameters: {
        'mode': mode, 'appelant': '1', 'nom': widget.conversation.interlocuteurNom,
      }).toString());
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _abonnement?.cancel();
    _texte.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final moi = ref.watch(utilisateurProvider)?.id;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.conversation.interlocuteurNom),
          Text(widget.conversation.structureNom ?? '', style: const TextStyle(fontSize: 13, color: C.texteDoux, fontWeight: FontWeight.w600)),
        ]),
        actions: [
          IconButton(tooltip: 'Appel audio', onPressed: _cle == null ? null : () => _appeler('AUDIO'), icon: const Icon(Icons.call_rounded)),
          IconButton(tooltip: 'Appel vidéo', onPressed: _cle == null ? null : () => _appeler('VIDEO'), icon: const Icon(Icons.videocam_rounded)),
          const Padding(padding: EdgeInsets.only(right: 10), child: BoutonVoix('chat', compact: true)),
        ],
      ),
      body: _bloque != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.lock_reset_rounded, size: 56, color: C.vert),
                  const SizedBox(height: 12),
                  Text(_bloque!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => ref.read(sessionProvider.notifier).deconnexion(),
                    icon: const Icon(Icons.login_rounded),
                    label: const Text('Me reconnecter'),
                  ),
                ]),
              ),
            )
          : Column(children: [
        Container(
          width: double.infinity,
          color: C.vertPale,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: const Row(children: [
            Icon(Icons.lock, size: 16, color: C.vert),
            SizedBox(width: 6),
            Expanded(child: Text('Conversation privée : seuls vous et votre interlocuteur la lisez, sur tous vos appareils. Même SAMA XHEL ne peut pas la lire.', style: TextStyle(fontSize: 13, color: C.vertFonce))),
          ]),
        ),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.all(12),
            itemCount: _messages.length,
            itemBuilder: (_, i) {
              final m = _messages[i];
              final mien = m.moi == moi;
              return Align(
                alignment: mien ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .75),
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: mien ? C.vert : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(mien ? 18 : 4),
                      bottomRight: Radius.circular(mien ? 4 : 18),
                    ),
                    border: mien ? null : Border.all(color: C.bordure),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    if (m.audio != null)
                      LecteurVocal(octets: m.audio, duree: m.duree?.toDouble(), clair: mien)
                    else
                      Text(m.texte ?? '', style: TextStyle(color: mien ? Colors.white : C.texte, fontSize: 16)),
                    const SizedBox(height: 2),
                    Text(heure(m.date), style: TextStyle(color: mien ? Colors.white70 : C.texteDoux, fontSize: 11)),
                  ]),
                ),
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            child: Row(children: [
              IconButton.filledTonal(
                tooltip: 'Message vocal',
                onPressed: _cle == null ? null : _vocal,
                icon: const Icon(Icons.mic_rounded),
                style: IconButton.styleFrom(minimumSize: const Size(52, 52)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _texte,
                  minLines: 1,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Votre message…'),
                  onSubmitted: (_) => _envoyer(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Envoyer',
                onPressed: _envoi ? null : _envoyer,
                icon: const Icon(Icons.send_rounded),
                style: IconButton.styleFrom(minimumSize: const Size(52, 52), backgroundColor: C.vert),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
