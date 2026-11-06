import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/maison.dart';
import '../../core/portails.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/voix.dart';
import '../../widgets/communs.dart';
import '../../widgets/logo_etablissement.dart';
import 'code_ecran.dart';

const regionsSenegal = [
  'Dakar', 'Diourbel', 'Fatick', 'Kaffrine', 'Kaolack', 'Kédougou', 'Kolda',
  'Louga', 'Matam', 'Saint-Louis', 'Sédhiou', 'Tambacounda', 'Thiès', 'Ziguinchor',
];

/// Inscription d'un parent en 3 étapes courtes : identité → besoins → consentements.
/// Avec [portail] : inscription DANS un hôpital (sa couleur, son logo) ; après l'activation,
/// l'application s'ouvre dans cet hôpital et propose tout de suite de le rejoindre.
class InscriptionEcran extends ConsumerStatefulWidget {
  const InscriptionEcran({super.key, this.portail});
  final String? portail;
  @override
  ConsumerState<InscriptionEcran> createState() => _InscriptionEcranState();
}

class _InscriptionEcranState extends ConsumerState<InscriptionEcran> {
  int _etape = 0;
  final _forms = [GlobalKey<FormState>(), GlobalKey<FormState>()];
  final _prenom = TextEditingController();
  final _nom = TextEditingController();
  final _tel = TextEditingController();
  final _email = TextEditingController();
  final _mdp = TextEditingController();
  final _comportements = TextEditingController();
  String? _region;
  int? _capacite;
  bool _dejaConsulte = false;
  bool _cgu = false;
  bool _sante = false;
  bool _ia = false; // consentement facultatif : jamais coché par défaut (loi 2008-12)
  bool _envoi = false;

  @override
  void dispose() {
    for (final c in [_prenom, _nom, _tel, _email, _mdp, _comportements]) {
      c.dispose();
    }
    super.dispose();
  }

  void _suivant() {
    if (_etape < 2 && !_forms[_etape].currentState!.validate()) return;
    setState(() => _etape++);
  }

  Future<void> _creer() async {
    if (!_cgu || !_sante) {
      toast(context, 'Vous devez accepter les deux premières conditions pour continuer.', erreur: true);
      return;
    }
    setState(() => _envoi = true);
    try {
      final destination = await ref.read(sessionProvider.notifier).inscription({
        'prenom': _prenom.text.trim(),
        'nom': _nom.text.trim(),
        'telephone': _tel.text.trim(),
        if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
        'password': _mdp.text,
        'langue': ref.read(langueProvider),
        if (_region != null) 'region': _region,
        if (_capacite != null) 'capacite_paiement': _capacite,
        'famille_vulnerable': _capacite == 0,
        'profil_besoins': {
          if (_comportements.text.trim().isNotEmpty) 'comportements': _comportements.text.trim(),
          'deja_consulte': _dejaConsulte,
        },
        'consentements': {'cgu': _cgu, 'donnees_sante': _sante, 'ia_analyse': _ia},
      });
      if (widget.portail != null) {
        await ref.read(maisonActiveProvider.notifier).entrer(widget.portail);
        maisonAOuvrir = widget.portail;
      }
      if (mounted) context.pushReplacement('/code', extra: ParamsCode.activation(_tel.text.trim(), destination));
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final etab = widget.portail == null ? null : ref.watch(portailProvider(widget.portail!)).value?.etablissement;
    return Scaffold(
      appBar: AppBar(
        title: Text(etab != null ? 'Mon compte chez ${etab.nomCourt}' : 'Créer mon compte'),
        backgroundColor: etab?.teinte,
        foregroundColor: etab != null ? Colors.white : null,
        titleTextStyle: etab != null ? const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'Nunito') : null,
        actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('inscription', compact: true))],
      ),
      body: SafeArea(
        child: Column(children: [
          LinearProgressIndicator(value: (_etape + 1) / 3, minHeight: 5, color: etab?.teinte ?? C.vert, backgroundColor: C.vertPale),
          if (etab != null && _etape == 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
              child: Centre(
                largeur: 520,
                child: Row(children: [
                  LogoEtablissement(etab, taille: 52),
                  const SizedBox(width: 12),
                  Expanded(child: Text('Votre dossier sera ouvert chez ${etab.nom}. Vous pourrez rejoindre d’autres hôpitaux plus tard.', style: const TextStyle(color: C.texteDoux))),
                ]),
              ),
            ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Centre(largeur: 520, child: [_identite(), _besoins(), _consentements()][_etape]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            child: Centre(
              largeur: 520,
              child: Row(children: [
                if (_etape > 0) ...[
                  Expanded(child: OutlinedButton(onPressed: () => setState(() => _etape--), child: const Text('Retour'))),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: _envoi ? null : (_etape < 2 ? _suivant : _creer),
                    child: _envoi ? const CircularProgressIndicator(color: Colors.white) : Text(_etape < 2 ? 'Continuer' : 'Créer mon compte'),
                  ),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _identite() => Form(
        key: _forms[0],
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Vos informations', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Text('Étape 1 sur 3', style: TextStyle(color: C.texteDoux)),
          const SizedBox(height: 16),
          TextFormField(controller: _prenom, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Votre prénom'), validator: _requis),
          const SizedBox(height: 12),
          TextFormField(controller: _nom, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Votre nom'), validator: _requis),
          const SizedBox(height: 12),
          TextFormField(
            controller: _tel,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Numéro de téléphone', hintText: '77 123 45 67', prefixIcon: Icon(Icons.phone)),
            validator: (v) {
              final t = (v ?? '').replaceAll(RegExp(r'[\s.-]'), '');
              return RegExp(r'^(\+?\d{9,15})$').hasMatch(t) ? null : 'Numéro invalide';
            },
          ),
          const SizedBox(height: 12),
          TextFormField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'E-mail (facultatif)')),
          const SizedBox(height: 12),
          TextFormField(
            controller: _mdp,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Mot de passe', helperText: 'Au moins 8 caractères, avec des lettres et des chiffres'),
            validator: (v) {
              final s = v ?? '';
              if (s.length < 8 || !RegExp(r'[A-Za-z]').hasMatch(s) || !RegExp(r'\d').hasMatch(s)) {
                return '8 caractères minimum, avec lettres et chiffres';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _region,
            decoration: const InputDecoration(labelText: 'Votre région'),
            items: [for (final r in regionsSenegal) DropdownMenuItem(value: r, child: Text(r))],
            onChanged: (v) => setState(() => _region = v),
          ),
        ]),
      );

  Widget _besoins() => Form(
        key: _forms[1],
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Mieux vous aider', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Row(children: [Expanded(child: Text('Étape 2 sur 3 — ces réponses restent confidentielles', style: TextStyle(color: C.texteDoux))), BoutonVoix('inscription_besoins', compact: true)]),
          const SizedBox(height: 16),
          TextFormField(
            controller: _comportements,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Qu’est-ce qui vous inquiète chez votre enfant ? (facultatif)', alignLabelWithHint: true),
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            value: _dejaConsulte,
            onChanged: (v) => setState(() => _dejaConsulte = v),
            title: const Text('Avez-vous déjà consulté un spécialiste ?'),
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 8),
          const Text('Pouvez-vous payer des séances de soins régulières ?', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (v, l) in [(0, 'Non, pas du tout'), (1, 'Un peu'), (2, 'Oui, en partie'), (3, 'Oui')])
              ChoiceChip(label: Text(l), selected: _capacite == v, onSelected: (_) => setState(() => _capacite = v)),
          ]),
          const SizedBox(height: 8),
          const Text('Cette information sert à vous proposer des structures adaptées à votre budget et, si besoin, l’aide du fonds de solidarité.',
              style: TextStyle(fontSize: 13, color: C.texteDoux)),
        ]),
      );

  Widget _consentements() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Votre accord', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        const Row(children: [Expanded(child: Text('Étape 3 sur 3', style: TextStyle(color: C.texteDoux))), BoutonVoix('inscription_accord', compact: true)]),
        const SizedBox(height: 12),
        _Accord(
          valeur: _cgu,
          onChanged: (v) => setState(() => _cgu = v),
          titre: 'J’accepte les conditions d’utilisation',
          texte: 'SAMA XHEL m’aide à repérer, m’orienter et suivre mon enfant. Ce n’est pas un service d’urgence.',
        ),
        _Accord(
          valeur: _sante,
          onChanged: (v) => setState(() => _sante = v),
          titre: 'J’accepte que les informations de santé de mon enfant soient enregistrées',
          texte: 'Elles sont chiffrées et visibles uniquement par vous et par les professionnels des structures que vous choisissez (loi n° 2008-12).',
        ),
        _Accord(
          valeur: _ia,
          onChanged: (v) => setState(() => _ia = v),
          titre: 'J’accepte l’aide de l’intelligence artificielle (facultatif)',
          texte: 'Elle analyse mon journal d’humeur pour alerter les soignants si je vais mal. Le médecin garde toujours la décision.',
        ),
      ]);

  String? _requis(String? v) => (v == null || v.trim().isEmpty) ? 'Champ obligatoire' : null;
}

class _Accord extends StatelessWidget {
  const _Accord({required this.valeur, required this.onChanged, required this.titre, required this.texte});
  final bool valeur;
  final ValueChanged<bool> onChanged;
  final String titre;
  final String texte;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: CheckboxListTile(
          value: valeur,
          onChanged: (v) => onChanged(v ?? false),
          title: Text(titre, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Padding(padding: const EdgeInsets.only(top: 4), child: Text(texte)),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        ),
      );
}
