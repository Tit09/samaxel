import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../widgets/communs.dart';
import 'accueil_pro.dart';

/// File des dossiers de la structure active, triée par l'IA (urgent → normal).
class DossiersEcran extends ConsumerStatefulWidget {
  const DossiersEcran({super.key});
  @override
  ConsumerState<DossiersEcran> createState() => _DossiersEcranState();
}

class _DossiersEcranState extends ConsumerState<DossiersEcran> {
  String _onglet = 'EN_COURS';
  String _recherche = '';

  bool _garder(Suivi s) {
    final ok = switch (_onglet) {
      'EN_COURS' => s.statut == 'ACTIF',
      'DEMANDE' => s.statut == 'DEMANDE',
      _ => s.statut == 'CLOS' || s.statut == 'REFUSE' || s.statut == 'ARCHIVE',
    };
    if (!ok) return false;
    if (_recherche.isEmpty) return true;
    final q = _recherche.toLowerCase();
    return s.numeroDossier.toLowerCase().contains(q) ||
        (s.enfant?.prenom.toLowerCase().contains(q) ?? false) ||
        (s.enfant?.nom.toLowerCase().contains(q) ?? false);
  }

  @override
  Widget build(BuildContext context) {
    final suivis = ref.watch(suivisProvider);
    final demandes = suivis.value?.suivis.where((s) => s.statut == 'DEMANDE').length ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Dossiers patients')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Centre(
            largeur: 1000,
            child: Column(children: [
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Nom, prénom ou n° de dossier'),
                onChanged: (v) => setState(() => _recherche = v.trim()),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<String>(
                  segments: [
                    const ButtonSegment(value: 'EN_COURS', label: Text('En cours')),
                    ButtonSegment(value: 'DEMANDE', label: Text(demandes > 0 ? 'Demandes ($demandes)' : 'Demandes')),
                    const ButtonSegment(value: 'CLOS', label: Text('Clos')),
                  ],
                  selected: {_onglet},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) => setState(() => _onglet = v.first),
                ),
              ),
            ]),
          ),
        ),
        Expanded(
          child: AsyncVue(
            suivis,
            reessayer: () => ref.invalidate(suivisProvider),
            donnees: (d) {
              final liste = d.suivis.where(_garder).toList();
              if (liste.isEmpty) return const Vide(icone: Icons.folder_open, titre: 'Aucun dossier');
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(suivisProvider),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: liste.length,
                  itemBuilder: (_, i) => Centre(largeur: 1000, child: CarteDossier(liste[i])),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}
