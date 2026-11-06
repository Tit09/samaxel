import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/donnees.dart';
import '../../core/modeles.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

/// Annuaire national : liste ou carte, filtres par trouble et région, tri par distance.
class AnnuaireEcran extends ConsumerStatefulWidget {
  const AnnuaireEcran({super.key, this.public = false});
  final bool public;
  @override
  ConsumerState<AnnuaireEcran> createState() => _AnnuaireEcranState();
}

class _AnnuaireEcranState extends ConsumerState<AnnuaireEcran> {
  final _recherche = TextEditingController();
  String _q = '';
  String? _trouble;
  String? _region;
  double? _lat;
  double? _lng;
  bool _carte = false;
  bool _localisation = false;

  Future<void> _pres() async {
    setState(() => _localisation = true);
    try {
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      if (p == LocationPermission.denied || p == LocationPermission.deniedForever) {
        if (mounted) toast(context, 'Autorisez la localisation pour voir les centres les plus proches.', erreur: true);
        return;
      }
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.low)).timeout(const Duration(seconds: 8));
      setState(() {
        _lat = pos.latitude;
        _lng = pos.longitude;
      });
    } catch (_) {
      if (mounted) toast(context, 'Position introuvable. Choisissez votre région.', erreur: true);
    } finally {
      if (mounted) setState(() => _localisation = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final FiltreStructures f = (q: _q, trouble: _trouble, region: _region, type: null, lat: _lat, lng: _lng);
    final structures = ref.watch(structuresProvider(f));
    final regions = ref.watch(regionsProvider).value ?? const <String>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Trouver de l’aide'),
        actions: [
          const BoutonVoix('annuaire', compact: true),
          IconButton(
            tooltip: _carte ? 'Liste' : 'Carte',
            onPressed: () => setState(() => _carte = !_carte),
            icon: Icon(_carte ? Icons.view_list_rounded : Icons.map_rounded),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Centre(
            largeur: 900,
            child: Column(children: [
              TextField(
                controller: _recherche,
                textInputAction: TextInputAction.search,
                onSubmitted: (v) => setState(() => _q = v.trim()),
                decoration: InputDecoration(
                  hintText: 'Nom d’un hôpital, d’une ville…',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _q.isEmpty
                      ? null
                      : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(() {
                            _recherche.clear();
                            _q = '';
                          })),
                ),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  FilterChip(
                    avatar: _localisation ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.near_me, size: 18),
                    label: const Text('Près de moi'),
                    selected: _lat != null,
                    onSelected: (v) => v ? _pres() : setState(() { _lat = null; _lng = null; }),
                  ),
                  const SizedBox(width: 8),
                  _Menu(
                    libelle: _region ?? 'Région',
                    actif: _region != null,
                    options: {null: 'Toutes les régions', for (final r in regions) r: r},
                    onChoix: (v) => setState(() => _region = v),
                  ),
                  const SizedBox(width: 8),
                  _Menu(
                    libelle: _trouble == null ? 'Trouble' : libellesTroubles[_trouble]!,
                    actif: _trouble != null,
                    options: {null: 'Tous les troubles', ...libellesTroubles},
                    onChoix: (v) => setState(() => _trouble = v),
                  ),
                ]),
              ),
            ]),
          ),
        ),
        Expanded(
          child: AsyncVue<List<Structure>>(
            structures,
            reessayer: () => ref.invalidate(structuresProvider(f)),
            donnees: (liste) {
              if (liste.isEmpty) return const Vide(icone: Icons.search_off, titre: 'Aucune structure trouvée', texte: 'Essayez une autre région ou un autre trouble.');
              return _carte ? _Carte(liste: liste, public: widget.public, moi: _lat == null ? null : LatLng(_lat!, _lng!)) : _Liste(liste: liste, public: widget.public);
            },
          ),
        ),
      ]),
    );
  }
}

class _Menu extends StatelessWidget {
  const _Menu({required this.libelle, required this.actif, required this.options, required this.onChoix});
  final String libelle;
  final bool actif;
  final Map<String?, String> options;
  final ValueChanged<String?> onChoix;

  @override
  Widget build(BuildContext context) => PopupMenuButton<String?>(
        onSelected: onChoix,
        itemBuilder: (_) => [for (final e in options.entries) PopupMenuItem(value: e.key, child: Text(e.value))],
        child: Chip(
          label: Text(libelle),
          backgroundColor: actif ? C.vertPale : Colors.white,
          side: BorderSide(color: actif ? C.vert : C.bordure),
          deleteIcon: const Icon(Icons.arrow_drop_down),
          onDeleted: () {},
        ),
      );
}

class _Liste extends StatelessWidget {
  const _Liste({required this.liste, required this.public});
  final List<Structure> liste;
  final bool public;

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: liste.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, i) => Centre(largeur: 900, child: CarteStructure(s: liste[i], public: public)),
      );
}

class CarteStructure extends StatelessWidget {
  const CarteStructure({super.key, required this.s, this.public = false});
  final Structure s;
  final bool public;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push(public ? '/structure-public/${s.id}' : '/structure/${s.id}'),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: s.partenaire ? C.vertPale : C.infoPale, borderRadius: BorderRadius.circular(12)),
                child: Icon(_icone(s.type), color: s.partenaire ? C.vert : C.info),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.nom, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text('${libellesTypes[s.type] ?? s.type} · ${s.commune ?? s.region}', style: const TextStyle(color: C.texteDoux, fontSize: 13.5)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 6, runSpacing: 4, children: [
                    if (s.partenaire) const _Pastille('Rendez-vous en ligne', C.vert),
                    if (s.distanceKm != null) _Pastille('${s.distanceKm!.toStringAsFixed(1)} km', C.info),
                    if (s.coutNiveau == 0) const _Pastille('Gratuit', C.normal),
                    for (final t in s.troubles.take(3)) _Pastille(libellesTroubles[t] ?? t, C.texteDoux),
                  ]),
                ]),
              ),
            ]),
          ),
        ),
      );
}

IconData _icone(String type) => switch (type) {
      'HOPITAL' => Icons.local_hospital_rounded,
      'ECOLE_INCLUSIVE' || 'ECOLE_SPECIALISEE' => Icons.school_rounded,
      'ASSOCIATION' => Icons.diversity_3_rounded,
      'CENTRE_ADDICTOLOGIE' => Icons.healing_rounded,
      _ => Icons.medical_services_rounded,
    };

class _Pastille extends StatelessWidget {
  const _Pastille(this.texte, this.couleur);
  final String texte;
  final Color couleur;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: couleur.withValues(alpha: .09), borderRadius: BorderRadius.circular(8)),
        child: Text(texte, style: TextStyle(color: couleur, fontSize: 12, fontWeight: FontWeight.w700)),
      );
}

class _Carte extends StatelessWidget {
  const _Carte({required this.liste, required this.public, this.moi});
  final List<Structure> liste;
  final bool public;
  final LatLng? moi;

  @override
  Widget build(BuildContext context) {
    final points = liste.where((s) => s.latitude != null && s.longitude != null).toList();
    return FlutterMap(
      options: MapOptions(initialCenter: moi ?? const LatLng(14.45, -14.6), initialZoom: moi != null ? 10 : 6.4),
      children: [
        TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'sn.samaxhel.sante'),
        MarkerLayer(markers: [
          if (moi != null) Marker(point: moi!, width: 24, height: 24, child: const Icon(Icons.my_location, color: C.info)),
          for (final s in points)
            Marker(
              point: LatLng(s.latitude!, s.longitude!),
              width: 44,
              height: 44,
              child: GestureDetector(
                onTap: () => showModalBottomSheet(
                  context: context,
                  showDragHandle: true,
                  builder: (_) => Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), child: CarteStructure(s: s, public: public)),
                ),
                child: Icon(Icons.location_on, size: 44, color: s.partenaire ? C.vert : C.info),
              ),
            ),
        ]),
        const RichAttributionWidget(attributions: [TextSourceAttribution('© OpenStreetMap')]),
      ],
    );
  }
}
