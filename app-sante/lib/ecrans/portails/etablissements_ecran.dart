import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../core/portails.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';
import '../../widgets/logo_etablissement.dart';

/// « Où êtes-vous suivi ? » : tous les établissements de santé mentale du Sénégal.
/// Ceux qui sont sur SAMA XHEL ouvrent leur portail ; les autres affichent leurs coordonnées.
class EtablissementsEcran extends ConsumerStatefulWidget {
  const EtablissementsEcran({super.key, this.public, this.enLigne});
  final String? public;
  final bool? enLigne;
  @override
  ConsumerState<EtablissementsEcran> createState() =>
      _EtablissementsEcranState();
}

class _EtablissementsEcranState extends ConsumerState<EtablissementsEcran> {
  final _q = TextEditingController();
  Timer? _attente;
  String _recherche = '';
  String? _public;
  bool? _enLigne;
  double? _lat;
  double? _lng;
  bool _localisation = false;

  @override
  void initState() {
    super.initState();
    _public = widget.public;
    _enLigne = widget.enLigne;
  }

  @override
  void didUpdateWidget(covariant EtablissementsEcran ancien) {
    super.didUpdateWidget(ancien);
    if (ancien.public != widget.public || ancien.enLigne != widget.enLigne) {
      setState(() {
        _public = widget.public;
        _enLigne = widget.enLigne;
      });
    }
  }

  @override
  void dispose() {
    _attente?.cancel();
    _q.dispose();
    super.dispose();
  }

  Future<void> _presDeMoi() async {
    setState(() => _localisation = true);
    try {
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) {
        p = await Geolocator.requestPermission();
      }
      if (p == LocationPermission.denied ||
          p == LocationPermission.deniedForever) {
        throw Exception();
      }
      final pos = await Geolocator.getCurrentPosition().timeout(
        const Duration(seconds: 12),
      );
      setState(() {
        _lat = pos.latitude;
        _lng = pos.longitude;
      });
    } catch (_) {
      if (mounted) {
        toast(
          context,
          'Position indisponible : cherchez par nom ou par ville.',
          erreur: true,
        );
      }
    } finally {
      if (mounted) setState(() => _localisation = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtres = (
      q: _recherche,
      public: _public,
      enLigne: _enLigne,
      lat: _lat,
      lng: _lng,
    );
    final liste = ref.watch(portailsProvider(filtres));
    return Scaffold(
      appBar: AppBar(title: const Text('Où êtes-vous suivi ?'), actions: const [Padding(padding: EdgeInsets.only(right: 10), child: BoutonVoix('etablissements', compact: true))]),
      body: Centre(
        largeur: 640,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
              child: TextField(
                controller: _q,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Nom, ville ou code (ex. cepiad)',
                ),
                onChanged: (v) {
                  _attente?.cancel();
                  _attente = Timer(
                    const Duration(milliseconds: 400),
                    () => setState(() => _recherche = v.trim()),
                  );
                },
              ),
            ),
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _Puce(
                    label: _localisation ? 'Localisation…' : 'Près de moi',
                    icone: Icons.my_location,
                    actif: _lat != null,
                    onTap: () => _lat != null
                        ? setState(() {
                            _lat = null;
                            _lng = null;
                          })
                        : _presDeMoi(),
                  ),
                  _Puce(
                    label: 'Enfants',
                    actif: _public == 'ENFANT',
                    onTap: () => setState(
                      () => _public = _public == 'ENFANT' ? null : 'ENFANT',
                    ),
                  ),
                  _Puce(
                    label: 'Adultes',
                    actif: _public == 'ADULTE',
                    onTap: () => setState(
                      () => _public = _public == 'ADULTE' ? null : 'ADULTE',
                    ),
                  ),
                  _Puce(
                    label: 'Personnes âgées',
                    actif: _public == 'PERSONNE_AGEE',
                    onTap: () => setState(
                      () => _public = _public == 'PERSONNE_AGEE'
                          ? null
                          : 'PERSONNE_AGEE',
                    ),
                  ),
                  _Puce(
                    label: 'Sur SAMA XHEL',
                    actif: _enLigne == true,
                    onTap: () => setState(
                      () => _enLigne = _enLigne == true ? null : true,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: AsyncVue<List<Etablissement>>(
                liste,
                reessayer: () => ref.invalidate(portailsProvider(filtres)),
                donnees: (l) => l.isEmpty
                    ? const Vide(
                        icone: Icons.search_off,
                        titre: 'Aucun établissement',
                        texte: 'Essayez un autre nom ou retirez un filtre.',
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
                        itemCount: l.length,
                        itemBuilder: (_, i) => CarteEtablissement(
                          l[i],
                          onTap: () => context.push('/portail/${l[i].code}'),
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CarteEtablissement extends StatelessWidget {
  const CarteEtablissement(
    this.e, {
    super.key,
    required this.onTap,
    this.sousTitre,
  });
  final Etablissement e;
  final VoidCallback onTap;
  final String? sousTitre;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 8),
    child: InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            LogoEtablissement(e),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    e.nom,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    sousTitre ??
                        [
                          if (e.parentNom != null) e.parentNom!,
                          e.commune ?? e.region,
                          if (e.distanceKm != null)
                            '${e.distanceKm!.toStringAsFixed(1)} km',
                        ].join(' · '),
                    style: const TextStyle(color: C.texteDoux, fontSize: 12.5),
                  ),
                  const SizedBox(height: 5),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: e.enLigne ? C.vertPale : const Color(0xFFEFEFEC),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      e.enLigne
                          ? 'Sur SAMA XHEL'
                          : 'Pas encore sur SAMA XHEL · appeler',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: e.enLigne ? C.vert : C.texteDoux,
                      ),
                    ),
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

class _Puce extends StatelessWidget {
  const _Puce({
    required this.label,
    required this.actif,
    required this.onTap,
    this.icone,
  });
  final String label;
  final bool actif;
  final VoidCallback onTap;
  final IconData? icone;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: FilterChip(
      avatar: icone != null ? Icon(icone, size: 16) : null,
      label: Text(label),
      selected: actif,
      onSelected: (_) => onTap(),
    ),
  );
}
