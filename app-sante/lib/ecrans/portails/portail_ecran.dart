import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/donnees.dart';
import '../../core/maison.dart';
import '../../core/modeles.dart';
import '../../core/portails.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../widgets/logo_etablissement.dart';
import 'etablissements_ecran.dart';

/// Portail d'un établissement : son logo, sa couleur, ses services et ses boutons.
class PortailEcran extends ConsumerWidget {
  const PortailEcran({super.key, required this.code});
  final String code;

  Future<void> _rejoindre(BuildContext context, WidgetRef ref, Portail p, {String? service}) async {
    final u = ref.read(utilisateurProvider);
    if (u == null) {
      context.push('/inscription?portail=$code');
      return;
    }
    // Pour qui ? La personne choisie a tout de suite son dossier dans l'établissement.
    final choix = await showModalBottomSheet<({String? personne, String motif})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PourQui(etablissement: p.etablissement),
    );
    if (choix == null || !context.mounted) return;
    try {
      final r = await Api.instance.post('/portails/$code/inscription', {
        'service_code': ?service,
        'personne_id': ?choix.personne,
        if (choix.motif.isNotEmpty) 'motif': choix.motif,
        'origine': 'PORTAIL',
      });
      ref.invalidate(mesEtablissementsProvider);
      ref.invalidate(suivisProvider);
      ref.invalidate(maisonProvider(code));
      // La famille « entre » dans cet hôpital : l'accueil prend ses couleurs et montre son dossier
      await ref.read(maisonActiveProvider.notifier).entrer(code);
      if (context.mounted) {
        toast(context, r['message'] as String? ?? 'Demande envoyée.');
        context.go('/accueil');
        context.push('/maison/$code');
      }
    } catch (e) {
      if (context.mounted) toast(context, messageErreur(e), erreur: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portail = ref.watch(portailProvider(code));
    final connecte = ref.watch(utilisateurProvider);
    return Scaffold(
      body: AsyncVue<Portail>(
        portail,
        reessayer: () => ref.invalidate(portailProvider(code)),
        donnees: (p) {
          final e = p.etablissement;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                expandedHeight: 240,
                backgroundColor: e.teinte,
                foregroundColor: Colors.white,
              titleTextStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'Nunito'),
                title: Text(e.nomCourt),
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    color: e.teinte,
                    padding: const EdgeInsets.fromLTRB(20, 80, 20, 16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        LogoEtablissement(e, taille: 72, surFond: true),
                        const SizedBox(height: 10),
                        Text(
                          e.nom,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        if (e.parentNom != null)
                          Text(
                            '${e.parentNom} · ${e.commune ?? e.region}',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12.5,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Centre(
                  largeur: 600,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (e.enLigne) const Align(alignment: Alignment.centerLeft, child: BoutonVoix('portail_presentation')),
                        if (e.horaires != null)
                          _Ligne(Icons.schedule, e.horaires!),
                        if (e.telephone != null)
                          _Ligne(Icons.call_outlined, e.telephone!),
                        if (e.adresse != null)
                          _Ligne(Icons.place_outlined, e.adresse!),
                        const SizedBox(height: 14),
                        if (e.enLigne) ...[
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: e.teinte,
                              minimumSize: const Size.fromHeight(52),
                            ),
                            onPressed: () => _rejoindre(context, ref, p),
                            icon: const Icon(Icons.how_to_reg_rounded),
                            label: Text(
                              connecte == null
                                  ? 'Je suis une famille — m’inscrire'
                                  : 'Rejoindre cet établissement',
                            ),
                          ),
                          const SizedBox(height: 10),
                          if (connecte == null) ...[
                            OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: e.teinte,
                                side: BorderSide(color: e.teinte, width: 2),
                                minimumSize: const Size.fromHeight(50),
                              ),
                              onPressed: () => context.push('/connexion?portail=${e.code}'),
                              icon: const Icon(Icons.login_rounded),
                              label: const Text(
                                'J’ai déjà un compte — me connecter',
                              ),
                            ),
                            const SizedBox(height: 10),
                            OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(46),
                              ),
                              onPressed: () => context.push('/connexion?portail=${e.code}&espace=personnel'),
                              icon: const Icon(Icons.badge_outlined),
                              label: const Text('Personnel de l’établissement'),
                            ),
                          ],
                        ] else ...[
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: C.orPale,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Text(
                              'Cet établissement n’est pas encore sur SAMA XHEL. Vous pouvez l’appeler directement. '
                              'Vous y travaillez ? Proposez-lui de rejoindre la plateforme.',
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (e.telephone != null)
                            FilledButton.icon(
                              style: FilledButton.styleFrom(
                                minimumSize: const Size.fromHeight(50),
                              ),
                              onPressed: () => launchUrl(
                                Uri.parse(
                                  'tel:${e.telephone!.replaceAll(' ', '')}',
                                ),
                              ),
                              icon: const Icon(Icons.call),
                              label: const Text('Appeler'),
                            ),
                          TextButton.icon(
                            onPressed: () => context.push('/creer-hopital'),
                            icon: const Icon(Icons.add_business_outlined),
                            label: const Text('Inscrire cet établissement'),
                          ),
                        ],
                        if (e.latitude != null)
                          TextButton.icon(
                            onPressed: () => launchUrl(
                              Uri.parse(
                                'https://www.openstreetmap.org/directions?to=${e.latitude},${e.longitude}',
                              ),
                              mode: LaunchMode.externalApplication,
                            ),
                            icon: const Icon(Icons.directions_outlined),
                            label: const Text('Itinéraire'),
                          ),
                        if (p.services.isNotEmpty) ...[
                          const Titre('Services'),
                          for (final s in p.services)
                            Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                leading: Icon(
                                  Icons.medical_information_outlined,
                                  color: e.teinte,
                                ),
                                title: Text(
                                  s.nom,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                subtitle: s.specialite != null
                                    ? Text(s.specialite!)
                                    : null,
                                trailing:
                                    e.enLigne && connecte?.estParent == true
                                    ? TextButton(
                                        onPressed: () => _rejoindre(
                                          context,
                                          ref,
                                          p,
                                          service: s.code,
                                        ),
                                        child: const Text('Choisir'),
                                      )
                                    : null,
                              ),
                            ),
                        ],
                        if (p.rattaches.isNotEmpty) ...[
                          const Titre('Services et cliniques rattachés'),
                          for (final r in p.rattaches)
                            CarteEtablissement(
                              r,
                              onTap: () => context.push('/portail/${r.code}'),
                            ),
                        ],
                        const SizedBox(height: 12),
                        const Text(
                          'Votre dossier reste dans cet établissement. Vos données sont chiffrées et protégées (loi n° 2008-12).',
                          style: TextStyle(color: C.texteDoux, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Ligne extends StatelessWidget {
  const _Ligne(this.icone, this.texte);
  final IconData icone;
  final String texte;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icone, size: 18, color: C.texteDoux),
        const SizedBox(width: 10),
        Expanded(child: Text(texte)),
      ],
    ),
  );
}

/// Feuille « Pour qui ? » : moi, mon enfant, un proche — et le motif.
class _PourQui extends ConsumerStatefulWidget {
  const _PourQui({required this.etablissement});
  final Etablissement etablissement;
  @override
  ConsumerState<_PourQui> createState() => _PourQuiState();
}

class _PourQuiState extends ConsumerState<_PourQui> {
  String? _personne;
  final _motif = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final personnes = ref.watch(enfantsProvider).value ?? const <Enfant>[];
    if (_personne == null && personnes.length == 1) _personne = personnes.first.id;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text('Rejoindre ${widget.etablissement.nomCourt}', style: Theme.of(context).textTheme.titleLarge)),
          const BoutonVoix('rejoindre', compact: true),
        ]),
        const SizedBox(height: 4),
        const Text('Pour qui demandez-vous un suivi ? L’équipe de l’établissement verra la demande et vous répondra.', style: TextStyle(color: C.texteDoux)),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final p in personnes)
            ChoiceChip(label: Text(p.libelle), selected: _personne == p.id, onSelected: (_) => setState(() => _personne = p.id)),
          ActionChip(
            avatar: const Icon(Icons.add, size: 18),
            label: const Text('Ajouter : moi, mon enfant, un proche'),
            onPressed: () { Navigator.pop(context); context.push('/enfant/ajouter'); },
          ),
        ]),
        const SizedBox(height: 12),
        TextField(controller: _motif, maxLines: 2, decoration: const InputDecoration(labelText: 'Pourquoi consultez-vous ? (facultatif)')),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: widget.etablissement.teinte, minimumSize: const Size.fromHeight(50)),
          onPressed: _personne == null ? null : () => Navigator.pop(context, (personne: _personne, motif: _motif.text.trim())),
          child: const Text('Envoyer la demande'),
        ),
      ]),
    );
  }
}
