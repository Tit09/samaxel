import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../widgets/communs.dart';

/// Mot de passe oublié : code reçu par SMS/e-mail puis nouveau mot de passe.
class MotDePasseEcran extends ConsumerStatefulWidget {
  const MotDePasseEcran({super.key});
  @override
  ConsumerState<MotDePasseEcran> createState() => _MotDePasseEcranState();
}

class _MotDePasseEcranState extends ConsumerState<MotDePasseEcran> {
  final _id = TextEditingController();
  final _code = TextEditingController();
  final _mdp = TextEditingController();
  bool _codeEnvoye = false;
  bool _envoi = false;

  Future<void> _action() async {
    setState(() => _envoi = true);
    final s = ref.read(sessionProvider.notifier);
    try {
      if (!_codeEnvoye) {
        await s.renvoyerCode(_id.text.trim(), 'reset');
        setState(() => _codeEnvoye = true);
        if (mounted) toast(context, 'Si ce compte existe, un code vient d’être envoyé.');
      } else {
        await s.reinitialiser(_id.text.trim(), _code.text.trim(), _mdp.text);
        if (mounted) {
          toast(context, 'Mot de passe modifié. Vous pouvez vous connecter.');
          Navigator.of(context).pop();
        }
      }
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Mot de passe oublié'), actions: const [Padding(padding: EdgeInsets.only(right: 10), child: BoutonVoix('mot_de_passe', compact: true))]),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Centre(
            largeur: 460,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TextField(controller: _id, enabled: !_codeEnvoye, decoration: const InputDecoration(labelText: 'Téléphone ou e-mail')),
              if (_codeEnvoye) ...[
                const SizedBox(height: 12),
                TextField(controller: _code, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'Code reçu')),
                const SizedBox(height: 4),
                TextField(controller: _mdp, obscureText: true, decoration: const InputDecoration(labelText: 'Nouveau mot de passe', helperText: '8 caractères minimum, lettres et chiffres')),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _envoi ? null : _action,
                child: Text(_codeEnvoye ? 'Changer le mot de passe' : 'Recevoir un code'),
              ),
            ]),
          ),
        ),
      );
}
