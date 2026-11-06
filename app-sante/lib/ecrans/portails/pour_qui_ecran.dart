import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';
import '../../core/stockage.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// « Pour qui ? » : chacun trouve sa porte (famille, soignant, établissement).
class PourQuiEcran extends StatelessWidget {
  const PourQuiEcran({super.key, this.pro = false});
  final bool pro;

  Future<void> _famille(BuildContext context, String pourQui) async {
    await Stockage.ecrire(Stockage.kPourQui, pourQui);
    if (context.mounted)
      context.push(
        '/etablissements?public=${pourQui == 'ENFANT'
            ? 'ENFANT'
            : pourQui == 'PARENT_AGE'
            ? 'PERSONNE_AGEE'
            : 'ADULTE'}',
      );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(pro ? 'Soignants et établissements' : 'Pour qui ?'),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 12),
            child: BoutonVoix('pour_qui', compact: true),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Centre(
            largeur: 560,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!pro) ...[
                  Text('Je cherche des soins', style: t.titleMedium),
                  const SizedBox(height: 10),
                  _Choix(
                    image: 'anxiete',
                    titre: 'Pour moi',
                    texte:
                        'Stress, dépression, addiction, troubles du sommeil…',
                    onTap: () => _famille(context, 'SOI'),
                  ),
                  _Choix(
                    image: 'autisme',
                    titre: 'Pour mon enfant',
                    texte: 'Autisme, TDAH, trisomie 21, retard de langage…',
                    onTap: () => _famille(context, 'ENFANT'),
                  ),
                  _Choix(
                    image: 'memoire',
                    titre: 'Pour un parent âgé ou un proche',
                    texte: 'Mémoire, comportement, isolement…',
                    onTap: () => _famille(context, 'PARENT_AGE'),
                  ),
                  const SizedBox(height: 6),
                  _Choix(
                    icone: Icons.quiz_outlined,
                    titre: 'Je ne sais pas encore',
                    texte: 'Faire un test rapide, sans compte',
                    onTap: () => context.push('/inscription'),
                  ),
                  const SizedBox(height: 18),
                ],
                Text(
                  pro ? 'Professionnels' : 'Vous êtes soignant ?',
                  style: t.titleMedium,
                ),
                const SizedBox(height: 10),
                _Choix(
                  icone: Icons.medical_services_outlined,
                  couleur: C.info,
                  titre: 'Je suis soignant',
                  texte: 'Médecin, psychologue, orthophoniste… Inscription par spécialité, puis choix de vos structures.',
                  onTap: () => launchUrl(
                    Uri.parse('${AppConfig.siteUrl}/#professionnels'),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
                _Choix(
                  icone: Icons.login_rounded,
                  couleur: C.info,
                  titre: 'J’ai déjà un compte soignant',
                  texte: 'Connexion avec un code de sécurité',
                  onTap: () => context.push('/connexion'),
                ),
                const SizedBox(height: 18),
                Text('Établissements', style: t.titleMedium),
                const SizedBox(height: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF8A3B12),
                        minimumSize: const Size.fromHeight(52),
                      ),
                      onPressed: () =>
                          context.push('/etablissements?en_ligne=true'),
                      icon: const Icon(Icons.apartment_rounded),
                      label: const Text('Connexion établissement'),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF8A3B12),
                        minimumSize: const Size.fromHeight(52),
                        side: const BorderSide(
                          color: Color(0xFF8A3B12),
                          width: 2,
                        ),
                      ),
                      onPressed: () => context.push('/creer-hopital'),
                      icon: const Icon(Icons.add_business_outlined),
                      label: const Text('Créer mon hôpital'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Choix extends StatelessWidget {
  const _Choix({
    this.image,
    this.icone,
    this.couleur = C.vert,
    required this.titre,
    required this.texte,
    required this.onTap,
  });
  final String? image;
  final IconData? icone;
  final Color couleur;
  final String titre;
  final String texte;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: image != null
                  ? Image.asset(
                      'assets/images/accueil/$image.webp',
                      width: 64,
                      height: 64,
                      fit: BoxFit.cover,
                    )
                  : Container(
                      width: 64,
                      height: 64,
                      color: couleur.withValues(alpha: 0.1),
                      child: Icon(icone, color: couleur, size: 30),
                    ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titre,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    texte,
                    style: const TextStyle(color: C.texteDoux, fontSize: 13),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: C.texteDoux),
          ],
        ),
      ),
    ),
  );
}
