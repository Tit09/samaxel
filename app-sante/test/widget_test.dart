import 'package:flutter_test/flutter_test.dart';
import 'package:sama_xhel_sante/core/modeles.dart';
import 'package:sama_xhel_sante/core/voix.dart';

void main() {
  test('un dossier renvoyé par l’API est bien lu (priorité et raisons de l’IA)', () {
    final s = Suivi.fromJson({
      'id': 's1', 'enfant_id': 'e1', 'structure_id': 'st1', 'numero_dossier': 'KX-2026-0001',
      'statut': 'DEMANDE', 'priorite': 'URGENT', 'triage_score': 82,
      'triage_raisons': [{'points': 40, 'texte': 'Alerte : régression du langage'}],
    });
    expect(s.priorite, 'URGENT');
    expect(s.score, 82);
    expect(s.raisons.single.points, 40);
  });

  test('les 8 langues du guide vocal sont disponibles, français par défaut', () {
    expect(langues.length, 8);
    expect(langueParCode('inconnu').code, 'fr');
    expect(langueParCode('wo').nom, 'Wolof');
  });
}
