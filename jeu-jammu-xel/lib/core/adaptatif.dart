/// IA adaptative embarquée : ajuste la difficulté des jeux de l'espace enfant
/// selon les réussites, sans score affiché, sans échec, sans donnée envoyée.
///
/// Règles (explicables) :
/// - deux manches réussies du premier coup d'affilée → niveau + 1 ;
/// - une manche avec deux erreurs ou plus → niveau − 1 ;
/// - le niveau reste entre [min] et [max].
class MoteurAdaptatif {
  MoteurAdaptatif({this.niveau = 1, this.min = 1, this.max = 4});

  int niveau;
  final int min;
  final int max;
  int _serie = 0;
  String explication = 'Niveau de départ.';

  /// À appeler à la fin d'une manche avec le nombre d'erreurs commises.
  int enregistrer({required int erreurs}) {
    if (erreurs == 0) {
      _serie++;
      if (_serie >= 2 && niveau < max) {
        niveau++;
        _serie = 0;
        explication = 'Deux réussites du premier coup : un peu plus de choix.';
      } else {
        explication = 'Réussi du premier coup.';
      }
    } else if (erreurs >= 2) {
      _serie = 0;
      if (niveau > min) {
        niveau--;
        explication = 'Plusieurs essais : on simplifie pour garder le plaisir.';
      } else {
        explication = 'Plusieurs essais : on garde le niveau le plus simple.';
      }
    } else {
      _serie = 0;
      explication = 'Réussi après un essai : on garde ce niveau.';
    }
    return niveau;
  }
}
