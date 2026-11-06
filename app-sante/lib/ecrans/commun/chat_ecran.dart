import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/temps_reel.dart';
import '../../core/donnees.dart';
import '../../core/e2ee.dart';
import '../../core/modeles.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Conversation chiffrée de bout en bout. Rafraîchie toutes les 8 secondes.
class ChatEcran extends ConsumerStatefulWidget {
  const ChatEcran({super.key, required this.conversation});
  final Conversation conversation;
  @override
  ConsumerState<ChatEcran> createState() => _ChatEcranState();
}

class _ChatEcranState extends ConsumerState<ChatEcran> {
  final _texte = TextEditingController();
  final _scroll = ScrollController();
  final List<({String id, String moi, String texte, DateTime? date})> _messages = [];
  Timer? _timer;
  StreamSubscription<Object?>? _abonnement;
  String? _cle;
  bool _envoi = false;

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
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  Future<void> _charger() async {
    if (_cle == null) return;
    final r = await Api.instance.get('/conversations/${widget.conversation.id}/messages');
    final liste = ((r['messages'] as List?) ?? []).map((m) => MessageChiffre.fromJson(Map<String, dynamic>.from(m))).toList();
    final connus = _messages.map((m) => m.id).toSet();
    var nouveau = false;
    for (final m in liste.where((m) => !connus.contains(m.id))) {
      final clair = await E2ee.instance.dechiffrer(m.ciphertext, m.nonce, _cle!, widget.conversation.id);
      _messages.add((id: m.id, moi: m.senderId, texte: clair, date: m.date));
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
        actions: [const Padding(padding: EdgeInsets.only(right: 10), child: BoutonVoix('chat', compact: true))],
      ),
      body: Column(children: [
        Container(
          width: double.infinity,
          color: C.vertPale,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: const Row(children: [
            Icon(Icons.lock, size: 16, color: C.vert),
            SizedBox(width: 6),
            Expanded(child: Text('Messages chiffrés de bout en bout : même SAMA XHEL ne peut pas les lire.', style: TextStyle(fontSize: 13, color: C.vertFonce))),
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
                    Text(m.texte, style: TextStyle(color: mien ? Colors.white : C.texte, fontSize: 16)),
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
