import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../core/portails.dart';
import '../widgets/logo_etablissement.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/config.dart';
import '../core/theme.dart';
import '../core/voix.dart';
import '../widgets/communs.dart';
import '../widgets/serveur.dart';

/// Une diapositive de l'accueil : image, titre, phrase lue à voix haute.
class Diapo {
  const Diapo(this.image, this.titre, this.texte, this.texteEn);
  final String image;
  final String titre;
  final String texte;
  final String texteEn;
}

const diapos = [
  Diapo('autisme', 'Autisme', 'Comprendre, accompagner, inclure. Votre enfant a sa place.', 'Understand, support, include.'),
  Diapo('tdah', 'TDAH', 'Agitation, inattention : ce n’est pas un caprice. On peut aider.', 'Restlessness and inattention can be helped.'),
  Diapo('down', 'Trisomie 21', 'Avec un suivi tôt, chaque enfant progresse.', 'With early support, every child progresses.'),
  Diapo('depression', 'Dépression', 'La tristesse qui dure se soigne. Vous n’êtes pas seul.', 'Lasting sadness can be treated.'),
  Diapo('anxiete', 'Stress et anxiété', 'Parler à quelqu’un, c’est déjà commencer à aller mieux.', 'Talking to someone is the first step.'),
  Diapo('bipolaire', 'Troubles de l’humeur', 'Les hauts et les bas extrêmes se soignent aussi.', 'Mood disorders can be treated.'),
  Diapo('addictions', 'Addictions', 'Drogue, alcool, écrans : une aide existe, sans jugement.', 'Help for addiction exists, without judgement.'),
  Diapo('traumatisme', 'Traumatismes', 'Après un choc, on peut retrouver la paix.', 'After trauma, peace can return.'),
  Diapo('memoire', 'Mémoire et personnes âgées', 'Ne pas oublier d’accompagner nos aînés.', 'Let us not forget to support our elders.'),
];

/// Accueil : diaporama commenté à voix haute dans la langue choisie, puis deux portes d'entrée.
class BienvenueEcran extends ConsumerStatefulWidget {
  const BienvenueEcran({super.key});
  @override
  ConsumerState<BienvenueEcran> createState() => _BienvenueEcranState();
}

class _BienvenueEcranState extends ConsumerState<BienvenueEcran> {
  final _pages = PageController();
  Timer? _minuterie;
  int _page = 0;
  bool _voix = true;
  bool _interaction = false; // la voix démarre au premier geste (règle des navigateurs et confort)

  @override
  void initState() {
    super.initState();
    _minuterie = Timer.periodic(const Duration(seconds: 7), (_) => _suivante());
    // Sur téléphone, la voix démarre seule ; dans un navigateur, au premier geste (autoplay bloqué)
    Future.delayed(const Duration(milliseconds: 900), () {
      if (mounted && !kIsWeb) {
        _interaction = true;
        _lire(0);
      }
    });
  }

  @override
  void dispose() {
    _minuterie?.cancel();
    _pages.dispose();
    GuideVocal.instance.arreter();
    super.dispose();
  }

  void _suivante() {
    if (!mounted || !_pages.hasClients) return;
    final n = (_page + 1) % diapos.length;
    _pages.animateToPage(n, duration: const Duration(milliseconds: 500), curve: Curves.easeOut);
  }

  Future<void> _lire(int i) async {
    if (!_voix || !_interaction) return;
    final d = diapos[i];
    await GuideVocal.instance.lire(
      cle: 'diapo_${d.image}',
      texteFr: '${d.titre}. ${d.texte}',
      texteEn: d.texteEn,
      langue: ref.read(langueProvider),
    );
  }

  void _changer(int i) {
    setState(() => _page = i);
    _lire(i);
  }

  @override
  Widget build(BuildContext context) {
    final langue = ref.watch(langueProvider);
    final hauteur = MediaQuery.sizeOf(context).height;
    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(children: [
        // ── Diaporama ─────────────────────────────────────────────────────
        SizedBox(
          height: (hauteur * 0.46).clamp(280, 460),
          child: Stack(children: [
            PageView.builder(
              controller: _pages,
              itemCount: diapos.length,
              onPageChanged: _changer,
              itemBuilder: (_, i) => _VueDiapo(diapos[i]),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 8, 0),
                child: Row(children: [
                  GestureDetector(
                    onLongPress: () => choisirServeur(context),
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                      child: Image.asset('assets/images/accueil/logo_symbole.png', height: 34),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text('SAMA XHEL', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: 0.5)),
                  ),
                  IconButton(
                    tooltip: _voix ? 'Couper la voix' : 'Activer la voix',
                    style: IconButton.styleFrom(backgroundColor: Colors.black26),
                    color: Colors.white,
                    icon: Icon(_voix ? Icons.volume_up_rounded : Icons.volume_off_rounded),
                    onPressed: () {
                      setState(() { _voix = !_voix; _interaction = true; });
                      _voix ? _lire(_page) : GuideVocal.instance.arreter();
                    },
                  ),
                ]),
              ),
            ),
            Positioned(
              left: 0, right: 0, bottom: 12,
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (var i = 0; i < diapos.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _page ? 18 : 7,
                    height: 7,
                    decoration: BoxDecoration(color: i == _page ? Colors.white : Colors.white54, borderRadius: BorderRadius.circular(4)),
                  ),
              ]),
            ),
          ]),
        ),

        // ── Langue et portes d'entrée ─────────────────────────────────────
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
            child: Centre(
              largeur: 560,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SizedBox(
                  height: 40,
                  child: ListView(scrollDirection: Axis.horizontal, children: [
                    for (final l in langues)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(l.nomLocal),
                          selected: l.code == langue,
                          onSelected: (_) async {
                            await ref.read(langueProvider.notifier).choisir(l.code);
                            setState(() => _interaction = true);
                            _lire(_page);
                          },
                        ),
                      ),
                  ]),
                ),
                const SizedBox(height: 14),
                Text('L’hôpital numérique de la santé mentale',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(color: C.vertFonce)),
                const SizedBox(height: 4),
                const Text('Pour un enfant, un adulte ou une personne âgée. Repérer tôt, trouver la bonne structure, être suivi.',
                    style: TextStyle(color: C.texteDoux)),
                const SizedBox(height: 16),
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                  onPressed: () => context.push('/pour-qui'),
                  icon: const Icon(Icons.favorite_rounded),
                  label: const Text('Je cherche des soins'),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  onPressed: () => context.push('/pour-qui?pro=1'),
                  icon: const Icon(Icons.medical_services_outlined),
                  label: const Text('Je suis soignant ou établissement'),
                ),
                const SizedBox(height: 6),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  TextButton(onPressed: () => context.push('/connexion'), child: const Text('J’ai déjà un compte')),
                  const Text('·', style: TextStyle(color: C.texteDoux)),
                  TextButton(onPressed: () => context.push('/etablissements'), child: const Text('Trouver un centre')),
                ]),
                // Ce que fait l'application, en 4 gestes (avec des images pour qui ne lit pas)
                const SizedBox(height: 14),
                Text('Avec SAMA XHEL, vous pouvez', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                const _CeQueFait(),
                const SizedBox(height: 16),
                Text('Les hôpitaux et centres sur SAMA XHEL', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                const Text('Chacun a son espace : son équipe, ses dossiers, sa caisse. Touchez un logo pour le découvrir.',
                    style: TextStyle(color: C.texteDoux, fontSize: 13)),
                const SizedBox(height: 8),
                const _Partenaires(),
                const SizedBox(height: 8),
                if (modeDemonstration)
                  StatefulBuilder(
                    builder: (context, maj) => TextButton.icon(
                      onPressed: () async { await choisirServeur(context); maj(() {}); },
                      icon: const Icon(Icons.dns_outlined, size: 18),
                      label: Text('Serveur : ${Uri.parse(AppConfig.apiUrl).authority} — modifier', style: const TextStyle(fontSize: 13)),
                    ),
                  ),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _VueDiapo extends StatelessWidget {
  const _VueDiapo(this.d);
  final Diapo d;
  @override
  Widget build(BuildContext context) => Stack(fit: StackFit.expand, children: [
        Image.asset('assets/images/accueil/${d.image}.webp', fit: BoxFit.cover),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x99000000), Color(0x00000000), Color(0xCC0F3D24)],
              stops: [0, 0.4, 1],
            ),
          ),
        ),
        Positioned(
          left: 20, right: 20, bottom: 34,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(d.titre, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(d.texte, style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.3)),
          ]),
        ),
      ]);
}


class _CeQueFait extends StatelessWidget {
  const _CeQueFait();
  static const _items = [
    (Icons.fact_check_rounded, Color(0xFF187A3B), 'Faire un test', 'Pour un enfant, un adulte ou une personne âgée'),
    (Icons.local_hospital_rounded, Color(0xFF1E5AA8), 'Trouver un hôpital', 'Le plus proche, qui parle votre langue'),
    (Icons.medical_services_rounded, Color(0xFFAD1457), 'Être suivi', 'Votre médecin : rendez-vous, messages, vidéo'),
    (Icons.confirmation_number_rounded, Color(0xFFE07B00), 'Payer son ticket', 'Wave, Orange Money, puis la file d’attente'),
  ];
  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
        final colonnes = c.maxWidth > 520 ? 4 : 2;
        final largeur = (c.maxWidth - (colonnes - 1) * 8) / colonnes;
        return Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (icone, couleur, titre, texte) in _items)
            Container(
              width: largeur,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: couleur.withValues(alpha: .08), borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(icone, color: couleur, size: 30),
                const SizedBox(height: 6),
                Text(titre, style: const TextStyle(fontWeight: FontWeight.w900)),
                Text(texte, style: const TextStyle(color: C.texteDoux, fontSize: 12.5)),
              ]),
            ),
        ]);
      });
}

class _Partenaires extends ConsumerWidget {
  const _Partenaires();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = ref.watch(partenairesProvider).value ?? const [];
    if (l.isEmpty) return const SizedBox(height: 8);
    return SizedBox(
      height: 104,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: l.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (_, i) => InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => context.push('/portail/${l[i].code}'),
          child: SizedBox(
            width: 96,
            child: Column(children: [
              Container(
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: l[i].teinte, width: 2)),
                child: LogoEtablissement(l[i], taille: 64),
              ),
              const SizedBox(height: 4),
              Text(l[i].nomCourt, maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
      ),
    );
  }
}
