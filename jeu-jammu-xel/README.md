# JÀMMU XEL — le jeu sérieux de SAMA XHEL

Troisième application de la plateforme SAMA XHEL : un jeu de santé mentale pensé pour le Sénégal,
**hors ligne**, **sans compte** et **sans collecte de données**.

- **Espace enfant**, pour les enfants autistes ou avec un trouble du neurodéveloppement :
  tout se comprend à la voix et en images.
  - Cinq jeux : les émotions, ma journée, pareil, je parle (tableau de communication), respirer.
  - Une **IA adaptative** règle la difficulté selon les réussites, sans aucun échec ni score affiché.
- **Espace parents** (le Pénc) : le joueur est « l'accompagnant », comme à l'hôpital de Fann.
  - La mission d'Awa et Amadou (autisme), les prologues de Modou (dépression) et de Maam Coumba (mémoire).
  - Le carnet de l'accompagnant.
  - « Reconnaître les signes » : autisme, TDAH, dépression, mémoire, addictions.
  - Xel, un **assistant IA embarqué** qui répond aux questions des parents. Il est explicable et ne pose jamais de diagnostic.
- Langues : wolof, français, anglais (texte et voix) ; le pulaar viendra ensuite.

## Lancer et construire

```
cd jeu-jammu-xel
flutter pub get
flutter test
flutter run -d chrome
flutter build apk --release --split-per-abi
flutter build web --release --no-web-resources-cdn --pwa-strategy=none
flutter build windows --release
```

`--split-per-abi` produit :
- `app-arm64-v8a-release.apk` pour les téléphones récents (64 bits) ;
- `app-armeabi-v7a-release.apk` pour les anciens téléphones (32 bits).

Il faut Android 7.0 au minimum, ce qui est le minimum du moteur Flutter.

## Sécurité et vie privée

- **Aucune permission Internet** dans l'application Android de production. Pour le vérifier :
  `aapt dump permissions app-arm64-v8a-release.apk`.
- Les seules données gardées sur l'appareil sont la langue, les réglages, le niveau des jeux, le carnet et les histoires terminées.
  Elles ne contiennent ni nom ni donnée de santé.
- Le bouton « Trouver une structure » ouvre l'annuaire SAMA XHEL dans le navigateur, sans rien transmettre.
- La clé de signature (`android/key.properties` et le fichier `.jks`) n'est jamais versionnée.

## Contenus

- Toutes les phrases sont dans un seul catalogue, `tool/phrases.py` (français, anglais, wolof).
- `python3 tool/textes.py` régénère `assets/textes/*.json`.
- `tool/gen_voix.py` génère les voix hors ligne :
  - français et anglais avec Piper ;
  - wolof avec le modèle Adia_TTS de CONCREE.
- Le **wolof** est une traduction de travail : elle doit être validée par des locuteurs natifs.
- Les **contenus de santé** doivent être relus par des professionnels avant toute diffusion.
- Illustrations originales en style « sous-verre » (atelier SVG du projet).
- Police : Andika (SIL, licence OFL).
