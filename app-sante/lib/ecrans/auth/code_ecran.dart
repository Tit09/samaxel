import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Paramètres de l'écran de code (activation du compte ou MFA)
class ParamsCode {
  ParamsCode._(this.mode, this.destination, {this.identifiant, this.mfaToken});
  factory ParamsCode.activation(String identifiant, String destination) =>
      ParamsCode._('activation', destination, identifiant: identifiant);
  factory ParamsCode.mfa(String mfaToken, String destination) => ParamsCode._('mfa', destination, mfaToken: mfaToken);

  final String mode;
  final String destination;
  final String? identifiant;
  final String? mfaToken;
}

class CodeEcran extends ConsumerStatefulWidget {
  const CodeEcran({super.key, required this.params});
  final ParamsCode params;
  @override
  ConsumerState<CodeEcran> createState() => _CodeEcranState();
}

class _CodeEcranState extends ConsumerState<CodeEcran> {
  final _code = TextEditingController();
  bool _envoi = false;

  Future<void> _valider() async {
    if (_code.text.length != 6) return;
    setState(() => _envoi = true);
    final s = ref.read(sessionProvider.notifier);
    try {
      if (widget.params.mode == 'mfa') {
        await s.validerMfa(widget.params.mfaToken!, _code.text);
      } else {
        await s.activer(widget.params.identifiant!, _code.text);
        if (mounted && !ref.read(sessionProvider).connecte) {
          toast(context, 'Compte activé. Vous pourrez vous connecter dès que votre structure aura validé votre accès.');
          Navigator.of(context).popUntil((r) => r.isFirst);
        }
      }
    } catch (e) {
      if (mounted) {
        toast(context, messageErreur(e), erreur: true);
        _code.clear();
      }
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  Future<void> _renvoyer() async {
    if (widget.params.mode == 'mfa') {
      toast(context, 'Reconnectez-vous pour recevoir un nouveau code.');
      Navigator.of(context).pop();
      return;
    }
    try {
      await ref.read(sessionProvider.notifier).renvoyerCode(widget.params.identifiant!, 'verification');
      if (mounted) toast(context, 'Un nouveau code vient d’être envoyé.');
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mfa = widget.params.mode == 'mfa';
    return Scaffold(
      appBar: AppBar(title: Text(mfa ? 'Code de sécurité' : 'Activer mon compte')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Centre(
            largeur: 440,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const SizedBox(height: 12),
              const Icon(Icons.sms_outlined, size: 64, color: C.vert),
              const SizedBox(height: 16),
              Text('Entrez le code à 6 chiffres', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(
                widget.params.destination.isEmpty ? 'Le code vous a été envoyé.' : 'Envoyé au ${widget.params.destination}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: C.texteDoux),
              ),
              const SizedBox(height: 12),
              const Center(child: BoutonVoix('code')),
              const SizedBox(height: 20),
              TextField(
                controller: _code,
                autofocus: true,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                maxLength: 6,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(fontSize: 34, letterSpacing: 14, fontWeight: FontWeight.w800),
                decoration: const InputDecoration(counterText: '', hintText: '••••••'),
                onChanged: (v) {
                  if (v.length == 6) _valider();
                },
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _envoi ? null : _valider, child: _envoi ? const CircularProgressIndicator(color: Colors.white) : const Text('Valider')),
              const SizedBox(height: 8),
              TextButton(onPressed: _renvoyer, child: const Text('Je n’ai pas reçu le code')),
              const SizedBox(height: 8),
              const Text('Ne communiquez jamais ce code, même à un agent SAMA XHEL.', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: C.texteDoux)),
            ]),
          ),
        ),
      ),
    );
  }
}
