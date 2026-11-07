import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:jammu_xel/core/adaptatif.dart';
import 'package:jammu_xel/core/assistant.dart';
import 'package:jammu_xel/ecrans/enfant/je_parle.dart';
import 'package:jammu_xel/ecrans/enfant/journee.dart';
import 'package:jammu_xel/ecrans/enfant/pareil.dart';
import 'package:jammu_xel/ecrans/parents/histoires.dart';

Map<String, String> lire(String l) => (jsonDecode(File('assets/textes/$l.json').readAsStringSync()) as Map<String, dynamic>).cast<String, String>();

void main() {
  final textes = {for (final l in ['fr', 'en', 'wo']) l: lire(l)};

  group('Textes', () {
    test('les trois langues ont exactement les mêmes clés', () {
      expect(textes['en']!.keys.toSet(), textes['fr']!.keys.toSet());
      expect(textes['wo']!.keys.toSet(), textes['fr']!.keys.toSet());
    });
    test('toutes les phrases utilisées par les jeux et les histoires existent', () {
      final cles = <String>{
        ...pictos, ...journee, ...objets,
        for (final q in questionsXel) ...[q.cle, ...q.reponses],
        for (final r in [missionAwa, prologueModou, prologueMaam]) ...[
          r.titre, r.intro, r.bilan,
          for (final e in r.etapes) ...[e.texte, ...e.observations, for (final c in e.choix) ...[c.texte, c.reponse, ...c.observations]],
        ],
      };
      final manquantes = cles.where((c) => !textes['fr']!.containsKey(c)).toList();
      expect(manquantes, isEmpty);
    });
    test('chaque phrase a sa voix enregistrée en wolof, français et anglais', () {
      for (final l in ['fr', 'en', 'wo']) {
        final sans = textes[l]!.keys.where((k) => !File('assets/voix/$l/$k.mp3').existsSync()).toList();
        expect(sans, isEmpty, reason: 'voix manquantes en $l');
      }
    });
  });

  group('IA adaptative', () {
    test('monte après deux réussites du premier coup', () {
      final m = MoteurAdaptatif();
      m.enregistrer(erreurs: 0);
      expect(m.niveau, 1);
      m.enregistrer(erreurs: 0);
      expect(m.niveau, 2);
    });
    test('redescend après une manche difficile, sans passer sous le minimum', () {
      final m = MoteurAdaptatif(niveau: 2);
      m.enregistrer(erreurs: 3);
      expect(m.niveau, 1);
      m.enregistrer(erreurs: 3);
      expect(m.niveau, 1);
    });
    test('ne dépasse jamais le maximum', () {
      final m = MoteurAdaptatif(niveau: 4);
      for (var i = 0; i < 6; i++) {
        m.enregistrer(erreurs: 0);
      }
      expect(m.niveau, 4);
    });
  });

  group('Assistant Xel', () {
    final xel = Xel((cle, l) => textes[l]![cle] ?? '');
    String? cle(String q) => xel.repondre(q).question?.cle;
    test('reconnaît les questions des parents, même formulées autrement', () {
      expect(cle('mon fils ne regarde pas les gens et ne répond pas à son prénom, est-il autiste ?'), 'xq_autiste');
      expect(cle("c'est le mauvais oeil ?"), 'xq_cause');
      expect(cle('où trouver un hôpital pour mon enfant'), 'xq_ou');
      expect(cle('mon frère veut se suicider'), 'xq_mourir');
      expect(cle('ma grand-mère oublie tout'), 'xq_memoire');
      expect(cle('il fume du yamba'), 'xq_drogue');
      expect(cle('how do I know if my child is autistic'), 'xq_autiste');
    });
    test("répond « je ne sais pas » hors de son domaine", () {
      expect(cle('quel temps fera-t-il demain à Thiès'), isNull);
    });
    test('explique sa réponse (mots retrouvés)', () {
      final r = xel.repondre('mon enfant fait des crises de colère');
      expect(r.question?.cle, 'xq_crise');
      expect(r.motsTrouves, isNotEmpty);
    });
  });
}
