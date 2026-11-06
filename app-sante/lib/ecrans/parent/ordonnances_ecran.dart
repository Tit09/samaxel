import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/communs.dart';

final ordonnancesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final r = await Api.instance.get('/ordonnances');
  return ((r['ordonnances'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
});

/// Ordonnances reçues + pharmacies proches qui ont DÉCLARÉ avoir le médicament.
class OrdonnancesEcran extends ConsumerWidget {
  const OrdonnancesEcran({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = ref.watch(ordonnancesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Ordonnances et pharmacies'), actions: const [Padding(padding: EdgeInsets.only(right: 10), child: BoutonVoix('ordonnances', compact: true))]),
      body: AsyncVue<List<Map<String, dynamic>>>(
        o,
        reessayer: () => ref.invalidate(ordonnancesProvider),
        donnees: (liste) => liste.isEmpty
            ? Vide(
                icone: Icons.medication_outlined,
                titre: 'Aucune ordonnance',
                texte: 'Quand le médecin prescrit un médicament, il apparaît ici avec les pharmacies proches.',
                action: OutlinedButton(onPressed: () => _ouvrirPharmacies(context, const []), child: const Text('Voir les pharmacies proches')),
              )
            : ListView(padding: const EdgeInsets.all(16), children: [
                for (final x in liste)
                  Centre(
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            const Icon(Icons.receipt_long_rounded, color: C.vert),
                            const SizedBox(width: 8),
                            Expanded(child: Text('Dr ${x['prescripteur']} · ${x['structure_nom']}', style: const TextStyle(fontWeight: FontWeight.w800))),
                            Text(dateCourte(DateTime.tryParse('${x['created_at']}')?.toLocal()), style: const TextStyle(color: C.texteDoux)),
                          ]),
                          const Divider(height: 20),
                          for (final l in (x['lignes'] as List))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${l['dci']}${l['forme'] != null ? ' — ${l['forme']}' : ''}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                                Text('${l['posologie']}${l['duree'] != null ? ' · ${l['duree']}' : ''}'),
                              ]),
                            ),
                          const SizedBox(height: 6),
                          if (x['delivrance_structure'] == true)
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(color: C.infoPale, borderRadius: BorderRadius.circular(12)),
                              child: Text('Ce médicament est délivré uniquement par ${x['structure_nom']}. Adressez-vous au centre.'),
                            )
                          else
                            FilledButton.icon(
                              onPressed: () => _ouvrirPharmacies(context, List<String>.from(x['dci'] as List)),
                              icon: const Icon(Icons.local_pharmacy_rounded),
                              label: const Text('Trouver une pharmacie'),
                            ),
                        ]),
                      ),
                    ),
                  ),
              ]),
      ),
    );
  }

  void _ouvrirPharmacies(BuildContext context, List<String> dci) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => PharmaciesEcran(dci: dci)));
}

class PharmaciesEcran extends StatefulWidget {
  const PharmaciesEcran({super.key, required this.dci});
  final List<String> dci;
  @override
  State<PharmaciesEcran> createState() => _PharmaciesEcranState();
}

class _PharmaciesEcranState extends State<PharmaciesEcran> {
  Map<String, dynamic>? _r;
  String? _erreur;

  @override
  void initState() {
    super.initState();
    _charger();
  }

  Future<void> _charger() async {
    double? lat;
    double? lng;
    try {
      // Délai dur : sur certains navigateurs la géolocalisation ne répond jamais ; on se rabat alors sur Dakar.
      final p = await (() async {
        if (await Geolocator.checkPermission() == LocationPermission.deniedForever) return null;
        await Geolocator.requestPermission();
        return Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.low));
      })().timeout(const Duration(seconds: 6));
      lat = p?.latitude;
      lng = p?.longitude;
    } catch (_) {}
    if (!mounted) return;
    try {
      final r = await Api.instance.get('/pharmacies', query: {'dci': widget.dci.join(','), 'lat': lat, 'lng': lng, 'region': lat == null ? 'Dakar' : null}, public: true);
      if (mounted) setState(() => _r = r);
    } catch (e) {
      if (mounted) setState(() => _erreur = messageErreur(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final liste = ((_r?['pharmacies'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Pharmacies proches')),
      body: _erreur != null
          ? VueErreur(_erreur!, reessayer: _charger)
          : _r == null
              ? const Chargement()
              : _r!['reserve_structure'] == true
                  ? Vide(icone: Icons.local_hospital_outlined, titre: 'Délivré par le centre', texte: _r!['message'])
                  : ListView(padding: const EdgeInsets.all(16), children: [
                      if (widget.dci.isNotEmpty)
                        Text('Médicament : ${widget.dci.join(', ')}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      const Text('« Disponible » = la pharmacie l’a déclaré à SAMA XHEL. Sinon, appelez avant de vous déplacer.',
                          style: TextStyle(color: C.texteDoux, fontSize: 13)),
                      const SizedBox(height: 10),
                      for (final p in liste) Centre(child: _CartePharmacie(p)),
                      const SizedBox(height: 12),
                      Text(_r!['attribution'] ?? '', style: const TextStyle(color: C.texteDoux, fontSize: 11)),
                    ]),
    );
  }
}

class _CartePharmacie extends StatelessWidget {
  const _CartePharmacie(this.p);
  final Map<String, dynamic> p;
  @override
  Widget build(BuildContext context) {
    final dispo = p['disponibilite'];
    final (txt, coul) = switch (dispo) {
      'DECLAREE' => ('Disponible (déclaré)', C.normal),
      'PARTIELLE' => ('Disponibilité partielle', C.prioritaire),
      'NON_RENSEIGNEE' => ('Disponibilité non renseignée', C.texteDoux),
      _ => ('', C.texteDoux),
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const CircleAvatar(backgroundColor: C.vertPale, child: Icon(Icons.local_pharmacy_rounded, color: C.vert)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p['nom'], style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                Text([p['commune'], p['region'], if (p['distance_km'] != null) '${p['distance_km']} km'].whereType<String>().join(' · '),
                    style: const TextStyle(color: C.texteDoux)),
              ]),
            ),
          ]),
          if (txt.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(txt, style: TextStyle(color: coul, fontWeight: FontWeight.w800))),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            if (p['telephone'] != null)
              FilledButton.icon(onPressed: () => launchUrl(Uri.parse('tel:${p['telephone']}')), icon: const Icon(Icons.call), label: const Text('Appeler')),
            if (p['latitude'] != null)
              OutlinedButton.icon(
                onPressed: () => launchUrl(Uri.parse('https://www.openstreetmap.org/directions?to=${p['latitude']},${p['longitude']}'), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.directions),
                label: const Text('Itinéraire'),
              ),
          ]),
        ]),
      ),
    );
  }
}
