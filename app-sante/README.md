# SAMA XHEL Santé — application mobile, web et bureau

Application Flutter de la plateforme SAMA XHEL (prise en charge des troubles du
neurodéveloppement au Sénégal). **Un seul code** pour Android, iOS, web, Windows,
macOS et Linux. Elle parle au backend `sama-xhel-sante-backend` (Node.js + PostgreSQL).

Le jeu thérapeutique est une **application séparée** : rien ici ne le concerne.

---

## 1. Qui fait quoi dans l'application

| Utilisateur | Ce qu'il voit |
|---|---|
| **Parent** | Choix de la langue + guide vocal, ses enfants, tests de repérage (7 questionnaires), résultat expliqué + structures recommandées par l'IA, annuaire et carte de toutes les structures du Sénégal, demande de prise en charge, rendez-vous (sur place ou vidéo), messagerie chiffrée, journal d'humeur, export de ses données |
| **Médecin** | File des patients **triée par l'IA** (urgent → normal) avec les raisons, accepter/refuser une demande, corriger la priorité (avec justification tracée), référent, comptes rendus (secret médical), journal d'humeur du parent, vidéo, messagerie |
| **Thérapeute** | Comme le médecin pour le suivi clinique, sans pouvoir accepter/refuser une demande |
| **Secrétaire** | Dossiers (administratif seulement : jamais le contenu médical), agenda : confirmer une date et un soignant, noter présent/absent |
| **Administrateur de structure** | Valider/suspendre les professionnels **de son hôpital**, ajouter un membre, statistiques de la structure |

Multi-tenant : un professionnel qui travaille dans deux structures (ex. Keur Xaleyi
et CEPIAD) choisit la structure active dans *Profil* ; il ne voit que les dossiers
de celle-ci. Le cloisonnement est garanti par PostgreSQL (Row-Level Security), pas
seulement par l'application.

## 2. Lancer l'application (développement)

Prérequis : Flutter 3.47 (version stable utilisée et testée ; `flutter upgrade` si besoin), le backend démarré (voir son README).

```bash
flutter pub get
# Navigateur (le plus simple pour tester) :
flutter run -d chrome --dart-define=API_URL=http://localhost:3001
# Téléphone Android branché en USB (mettre l'adresse IP du PC sur le Wi-Fi) :
flutter run --dart-define=API_URL=http://192.168.1.20:3001
# Émulateur Android : l'adresse du PC est 10.0.2.2
flutter run --dart-define=API_URL=http://10.0.2.2:3001
```

Le backend doit autoriser l'origine du navigateur : `CORS_ORIGINS=http://localhost:8080`
dans son `.env` (le port affiché par `flutter run -d chrome`).

Comptes de démonstration (mot de passe `Demo@2026sx`) :
`parent@samaxhel.sn`, `medecin@samaxhel.sn`, `therapeute@samaxhel.sn`,
`secretaire@samaxhel.sn`, `admin.kx@samaxhel.sn`. Les professionnels ont une
double authentification : en développement, le code à 6 chiffres s'affiche dans
le terminal du backend (`[OTP:mfa] … → 123456`).

## 3. Construire les versions à installer

```bash
flutter build apk --release --dart-define=API_URL=https://api.samaxhel.sn       # Android (.apk)
flutter build appbundle --release --dart-define=API_URL=https://api.samaxhel.sn # Play Store (.aab)
flutter build web --release --dart-define=API_URL=https://api.samaxhel.sn       # site web
flutter build windows --release --dart-define=API_URL=https://api.samaxhel.sn   # sur un PC Windows
flutter build macos --release --dart-define=API_URL=https://api.samaxhel.sn     # sur un Mac
flutter build ios --release --dart-define=API_URL=https://api.samaxhel.sn       # sur un Mac avec Xcode
```

Avant la mise en production :
- enlever `android:usesCleartextTraffic="true"` de `android/app/src/main/AndroidManifest.xml`
  (il n'est là que pour tester en `http://` sur le réseau local) ;
- signer l'APK avec une clé de publication (voir la doc Flutter « Build and release an Android app »).

## 4. Le guide vocal en langues nationales

8 langues : wolof, pulaar, sérère, diola, mandinka (socé), bambara, français, anglais.
Chaque écran a un bouton **Écouter**.

- Si le fichier `assets/voix/<langue>/<clé>.mp3` existe, il est joué (hors ligne).
- Sinon, la synthèse vocale du téléphone lit la phrase en français (ou en anglais).

Pour produire les voix : `tools/traductions_voix.csv` contient les 93 phrases
(20 phrases d'écran + 73 questions des tests). Faites-les traduire par des locuteurs
natifs, puis lancez `tools/generer_voix.py` sur Google Colab (instructions en tête
du fichier). Wolof : modèle sénégalais **Adia_TTS** (CONCREE) ; autres langues :
Meta **MMS-TTS** si le modèle existe pour la langue. **Chaque fichier doit être
écouté et validé par un locuteur natif** avant publication.

## 5. Sécurité côté application

- Jetons stockés dans le coffre sécurisé du système (Keychain / Keystore) ;
  renouvellement automatique du jeton d'accès (15 min) ; déconnexion si le
  jeton de renouvellement est refusé.
- **Messagerie chiffrée de bout en bout** : X25519 + HKDF-SHA256 + AES-256-GCM.
  La clé privée ne quitte jamais l'appareil ; chaque compte a sa propre clé.
  Conséquence voulue : sur un **nouveau téléphone**, les anciens messages
  s'affichent « illisibles ici » (le serveur ne peut pas les déchiffrer non plus).
- Aucune donnée de santé en cache non chiffré ; la position n'est jamais enregistrée.

## 6. Organisation du code

```
lib/
  main.dart                 point d'entrée (français, taille du texte limitée à 140 %)
  core/
    config.dart             adresse de l'API, numéro du SAMU (1515)
    api.dart                client HTTP (dio) + renouvellement automatique du jeton
    session.dart            connexion, double authentification, changement de structure
    donnees.dart            toutes les lectures de l'API (Riverpod), rafraîchies toutes les 30 s
    modeles.dart            Enfant, Structure, Suivi, RendezVous, Consultation…
    e2ee.dart               chiffrement de bout en bout de la messagerie
    voix.dart, phrases.dart guide vocal (8 langues)
    routeur.dart            navigation + protection des routes selon le rôle
    theme.dart              couleurs du logo, police Nunito (embarquée, marche hors ligne)
  widgets/communs.dart      badges, cartes, états vides/erreur, bouton « Écouter »
  ecrans/
    auth/                   bienvenue, connexion, inscription, code, mot de passe
    parent/                 accueil, enfants, tests, résultat, annuaire/carte, RDV, humeur
    pro/                    tableau de bord IA, dossiers, dossier, agenda, compte rendu, administration
    commun/                 messages, conversation chiffrée, notifications, profil, vidéo
tools/
  parcours.js, outils.js    tests de bout en bout (Playwright) sur la version web
  scenario_croise.js        parent ↔ médecin : rendez-vous vidéo + messagerie chiffrée
  generer_voix.py           génération des voix (Colab)
  traductions_voix.csv      phrases à traduire
```

## 7. Tests

```bash
flutter analyze          # 0 problème
flutter test             # tests unitaires
# Parcours complets sur la version web (backend + `python3 -m http.server 8080` dans build/web) :
node tools/parcours.js parent
node tools/parcours.js medecin
node tools/scenario_croise.js
```
