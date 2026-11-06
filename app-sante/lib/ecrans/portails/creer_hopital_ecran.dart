import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// « Créer mon hôpital » : les étapes d'adhésion d'un établissement.
/// L'établissement n'accède à aucun patient tant que l'adhésion n'est pas validée.
class CreerHopitalEcran extends StatelessWidget {
  const CreerHopitalEcran({super.key});

  static const _etapes = [
    (
      Icons.edit_note_rounded,
      'Demande',
      'Nom de l’établissement, type, région, services proposés et responsable (directeur ou chef de service).',
    ),
    (
      Icons.folder_copy_outlined,
      'Pièces',
      'Agrément ou arrêté de création, NINEA, lettre de la direction, pièce d’identité du responsable.',
    ),
    (
      Icons.event_available_outlined,
      'Visite sur place',
      'L’équipe SAMA XHEL vient vérifier l’établissement et rencontrer le responsable.',
    ),
    (
      Icons.verified_outlined,
      'Validation',
      'Le portail est ouvert : logo, couleur, services. L’administrateur invite son personnel.',
    ),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Créer mon hôpital')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Centre(
          largeur: 560,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Votre établissement aura son propre espace sur SAMA XHEL : son portail, son personnel et ses dossiers, '
                'séparés de ceux des autres établissements.',
              ),
              const SizedBox(height: 16),
              for (var i = 0; i < _etapes.length; i++)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: const Color(0xFFF6E7DE),
                      foregroundColor: const Color(0xFF8A3B12),
                      child: Text(
                        '${i + 1}',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                    title: Text(
                      _etapes[i].$2,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(_etapes[i].$3),
                    trailing: Icon(
                      _etapes[i].$1,
                      color: const Color(0xFF8A3B12),
                    ),
                  ),
                ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: C.infoPale,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Text(
                  'Pendant la vérification, le compte du responsable montre l’avancement des étapes mais ne donne accès à aucun patient.',
                  style: TextStyle(color: C.info),
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF8A3B12),
                  minimumSize: const Size.fromHeight(52),
                ),
                onPressed: () => launchUrl(
                  Uri.parse('${AppConfig.siteUrl}/#etablissements'),
                  mode: LaunchMode.externalApplication,
                ),
                icon: const Icon(Icons.open_in_new_rounded),
                label: const Text('Déposer la demande sur le site'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
