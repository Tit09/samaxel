import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/stockage.dart';
import '../../core/voix.dart';
import '../../widgets/communs.dart';
import '../auth/inscription_ecran.dart' show regionsSenegal;

class EnfantFormEcran extends ConsumerStatefulWidget {
  const EnfantFormEcran({super.key});
  @override
  ConsumerState<EnfantFormEcran> createState() => _EnfantFormEcranState();
}

class _EnfantFormEcranState extends ConsumerState<EnfantFormEcran> {
  final _form = GlobalKey<FormState>();
  final _prenom = TextEditingController();
  final _nom = TextEditingController();
  DateTime? _naissance;
  String _sexe = 'M';
  String? _region;
  String _langue = 'wo';
  bool _scolarise = false;
  bool _envoi = false;
  String _lien = 'ENFANT'; // SOI, ENFANT, PARENT_AGE, PROCHE

  @override
  void initState() {
    super.initState();
    Stockage.lire(Stockage.kPourQui).then((v) {
      if (v != null && mounted) setState(() => _lien = v);
    });
  }


  Future<void> _choisirDate() async {
    final maintenant = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _naissance ?? DateTime(maintenant.year - (_lien == 'ENFANT' ? 3 : _lien == 'PARENT_AGE' ? 70 : 30)),
      firstDate: DateTime(maintenant.year - 110),
      lastDate: maintenant,
      helpText: 'Date de naissance',
      initialDatePickerMode: DatePickerMode.year,
    );
    if (d != null) setState(() => _naissance = d);
  }

  Future<void> _enregistrer() async {
    if (!_form.currentState!.validate()) return;
    if (_naissance == null) {
      toast(context, 'Choisissez la date de naissance', erreur: true);
      return;
    }
    setState(() => _envoi = true);
    try {
      final r = await Api.instance.post('/enfants', {
        'prenom': _prenom.text.trim(),
        'nom': _nom.text.trim(),
        'date_naissance': DateFormat('yyyy-MM-dd').format(_naissance!),
        'sexe': _sexe,
        if (_region != null) 'region': _region,
        'langue_maison': _langue,
        'scolarise': _scolarise,
        'lien': _lien,
      });
      ref.invalidate(enfantsProvider);
      if (!mounted) return;
      toast(context, '${_prenom.text.trim()} a été ajouté(e).');
      context.pushReplacement('/enfant/${r['enfant']['id']}');
    } catch (e) {
      if (mounted) toast(context, messageErreur(e), erreur: true);
    } finally {
      if (mounted) setState(() => _envoi = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Ajouter une personne suivie'), actions: const [Padding(padding: EdgeInsets.only(right: 12), child: BoutonVoix('ajout_enfant', compact: true))]),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Centre(
              largeur: 520,
              child: Form(
                key: _form,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('Pour qui ?', style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final (v, l) in const [('SOI', 'Moi-même'), ('ENFANT', 'Mon enfant'), ('PARENT_AGE', 'Un parent âgé'), ('PROCHE', 'Un proche')])
                      ChoiceChip(label: Text(l), selected: _lien == v, onSelected: (_) => setState(() => _lien = v)),
                  ]),
                  const SizedBox(height: 16),
                  TextFormField(controller: _prenom, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: _lien == 'SOI' ? 'Votre prénom' : 'Prénom'), validator: _requis),
                  const SizedBox(height: 12),
                  TextFormField(controller: _nom, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nom'), validator: _requis),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: _choisirDate,
                    borderRadius: BorderRadius.circular(14),
                    child: InputDecorator(
                      decoration: const InputDecoration(labelText: 'Date de naissance', prefixIcon: Icon(Icons.cake_outlined)),
                      child: Text(_naissance == null ? 'Appuyez pour choisir' : DateFormat('d MMMM yyyy', 'fr_FR').format(_naissance!)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('Sexe', style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'M', label: Text('Masculin'), icon: Icon(Icons.male_rounded)),
                      ButtonSegment(value: 'F', label: Text('Féminin'), icon: Icon(Icons.female_rounded)),
                    ],
                    selected: {_sexe},
                    onSelectionChanged: (s) => setState(() => _sexe = s.first),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _langue,
                    decoration: const InputDecoration(labelText: 'Langue parlée à la maison'),
                    items: [for (final l in langues) DropdownMenuItem(value: l.code, child: Text(l.nom))],
                    onChanged: (v) => setState(() => _langue = v ?? 'wo'),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _region,
                    decoration: const InputDecoration(labelText: 'Région de résidence'),
                    items: [for (final r in regionsSenegal) DropdownMenuItem(value: r, child: Text(r))],
                    onChanged: (v) => setState(() => _region = v),
                  ),
                  if (_lien == 'ENFANT') SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _scolarise,
                    onChanged: (v) => setState(() => _scolarise = v),
                    title: const Text('Va à l’école ou au daara'),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: _envoi ? null : _enregistrer, child: const Text('Enregistrer')),
                  const SizedBox(height: 10),
                  const Text('Le nom et la date de naissance sont chiffrés : seuls vous et les soignants que vous choisissez peuvent les lire.',
                      style: TextStyle(fontSize: 13), textAlign: TextAlign.center),
                ]),
              ),
            ),
          ),
        ),
      );

  String? _requis(String? v) => (v == null || v.trim().isEmpty) ? 'Champ obligatoire' : null;
}
