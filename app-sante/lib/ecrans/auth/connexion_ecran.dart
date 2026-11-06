import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/maison.dart';
import '../../core/portails.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../widgets/logo_etablissement.dart';
import 'code_ecran.dart';

/// Connexion. Avec [portail] : on entre dans la « maison » d'un établissement (logo, couleur).
///   • patients et familles : l'application s'ouvre ensuite dans cet hôpital ;
///   • personnel : seul un compte de CET établissement est accepté (contrôle côté serveur).
/// Sans portail, le personnel est renvoyé vers le portail de son établissement.
class ConnexionEcran extends ConsumerStatefulWidget {
  const ConnexionEcran({super.key, this.portail, this.espace});
  final String? portail;
  final String? espace; // 'personnel' pour l'accès du personnel
  @override
  ConsumerState<ConnexionEcran> createState() => _ConnexionEcranState();
}

class _ConnexionEcranState extends ConsumerState<ConnexionEcran> {
  final _form = GlobalKey<FormState>();
  final _id = TextEditingController();
  final _mdp = TextEditingController();
  bool _cache = true;
  bool _envoi = false;

  @override
  void dispose() {
    _id.dispose();
    _mdp.dispose();
    super.dispose();
  }

  Future<void> _connecter({String? portail}) async {
    if (!_form.currentState!.validate()) return;
    setState(() => _envoi = true);
    try {
      final r = await ref.read(sessionProvider.notifier).connexion(_id.text, _mdp.text, portail: portail ?? widget.portail);
      if (!mounted) return;
      switch (r) {
        case PortailRequis(:final portails):
          // Personnel : on entre par la porte de SON établissement (une seule → directement)
          String? code = portails.length == 1 ? portails.first['code'] : null;
          code ??= await showModalBottomSheet<String>(
            context: context,
            showDragHandle: true,
            builder: (_) => SafeArea(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Padding(padding: EdgeInsets.all(12), child: Text('Dans quel établissement travaillez-vous aujourd’hui ?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
                for (final p in portails)
                  ListTile(
                    leading: Icon(Icons.local_hospital_rounded, color: couleurDe(p['couleur']) ?? C.vert),
                    title: Text(p['nom'] ?? p['code']),
                    onTap: () => Navigator.pop(context, p['code'] as String),
                  ),
              ]),
            ),
          );
          if (code != null && mounted) {
            toast(context, 'Connexion dans votre établissement…');
            setState(() => _envoi = false);
            await _connecter(portail: code);
            return;
          }
        case MfaRequis(:final mfaToken, :final destination):
          context.push('/code', extra: ParamsCode.mfa(mfaToken, destination));
        case ActivationRequise(:final identifiant, :final destination):
          context.push('/code', extra: ParamsCode.activation(identifiant, destination));
        case Connecte():
          break; // le routeur redirige vers l'accueil
      }
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final etab = widget.portail == null ? null : ref.watch(portailProvider(widget.portail!)).value?.etablissement;
    final personnel = widget.espace == 'personnel';
    return Scaffold(
      appBar: AppBar(
        title: Text(etab != null ? (personnel ? '${etab.nomCourt} · Personnel' : etab.nomCourt) : 'Connexion'),
        backgroundColor: etab?.teinte,
        foregroundColor: etab != null ? Colors.white : null,
        titleTextStyle: etab != null ? const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'Nunito') : null,
        actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('connexion', compact: true))],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Centre(
            largeur: 480,
            child: Form(
              key: _form,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (etab != null) ...[
                  Center(child: LogoEtablissement(etab, taille: 92)),
                  const SizedBox(height: 10),
                  Text(etab.nom, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text(
                      personnel
                          ? 'Espace du personnel de cet établissement. Un code de sécurité vous sera envoyé.'
                          : 'Patients, familles et personnel de l’établissement : chacun entre avec son compte.',
                      textAlign: TextAlign.center, style: const TextStyle(color: C.texteDoux, fontSize: 13)),
                ] else
                  Image.asset('assets/images/embleme.png', height: 110),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _id,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.telephoneNumber, AutofillHints.email],
                  decoration: const InputDecoration(labelText: 'Téléphone ou e-mail', prefixIcon: Icon(Icons.phone_iphone_rounded), hintText: '77 123 45 67'),
                  validator: (v) => (v == null || v.trim().length < 3) ? 'Écrivez votre numéro ou votre e-mail' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _mdp,
                  obscureText: _cache,
                  autofillHints: const [AutofillHints.password],
                  onFieldSubmitted: (_) => _connecter(),
                  decoration: InputDecoration(
                    labelText: 'Mot de passe',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(
                      tooltip: _cache ? 'Afficher' : 'Masquer',
                      icon: Icon(_cache ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      onPressed: () => setState(() => _cache = !_cache),
                    ),
                  ),
                  validator: (v) => (v == null || v.isEmpty) ? 'Écrivez votre mot de passe' : null,
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(onPressed: () => context.push('/mot-de-passe'), child: const Text('Mot de passe oublié ?')),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  style: etab != null ? FilledButton.styleFrom(backgroundColor: etab.teinte) : null,
                  onPressed: _envoi ? null : () => _connecter(),
                  child: _envoi ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)) : const Text('Se connecter'),
                ),
                const SizedBox(height: 18),
                Wrap(alignment: WrapAlignment.center, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  const Text('Pas encore de compte ?', style: TextStyle(color: C.texteDoux)),
                  TextButton(
                    onPressed: () => context.pushReplacement(widget.portail != null ? '/inscription?portail=${widget.portail}' : '/inscription'),
                    child: Text(etab != null ? 'Créer mon compte chez ${etab.nomCourt}' : 'Créer un compte'),
                  ),
                ]),
                const SizedBox(height: 12),
                const Row(children: [
                  Icon(Icons.verified_user_outlined, size: 18, color: C.vert),
                  SizedBox(width: 8),
                  Expanded(child: Text('Vos données de santé sont chiffrées et protégées (loi n° 2008-12).', style: TextStyle(fontSize: 13, color: C.texteDoux))),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
