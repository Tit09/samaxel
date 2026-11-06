# SAMA XHEL — lancer le serveur sur votre ordinateur

Ce dossier lance **le vrai serveur SAMA XHEL** : l'API, la base de données, le site vitrine et le
téléchargement de l'application Android. C'est la même installation que sur le futur serveur en ligne.
Les téléphones s'y connectent par **le même Wi-Fi**. Données **fictives** uniquement.

Une seule adresse : `http://ADRESSE-DU-PC:3001`
- `/` : le site vitrine
- `/api` : l'API utilisée par l'application
- `/telechargements/SAMA-XHEL-Sante.apk` : l'application Android

## 1. Une seule fois

1. Installer **Docker Desktop** : https://www.docker.com/products/docker-desktop/ puis redémarrer l'ordinateur et ouvrir Docker Desktop.
2. Décompresser le dossier dans `C:\SAMA-XHEL` (il doit contenir `backend`, `serveur`, `site-vitrine`).
3. Ouvrir **PowerShell en administrateur** et autoriser le port 3001 sur le réseau privé :

```powershell
New-NetFirewallRule -DisplayName "SAMA XHEL 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
```

   Dans Paramètres Windows > Réseau et Internet > Wi-Fi, le réseau doit être en **Privé**.

4. Créer votre fichier de configuration (il ne quitte jamais votre ordinateur) :

```powershell
cd C:\SAMA-XHEL\serveur
copy .env.exemple .env
notepad .env
```

   Collez le jeton Telegram (`TELEGRAM_BOT_TOKEN`) et le nom du bot sans @ (`TELEGRAM_BOT_USERNAME`).
   Laissez vides les lignes Orange et WhatsApp tant que vous n'avez pas leurs identifiants. Enregistrez.

## 2. Démarrer

```powershell
cd C:\SAMA-XHEL\serveur
docker compose up -d --build
docker compose logs -f api
```

Le premier démarrage prend 3 à 5 minutes. Attendez la ligne **« SAMA XHEL est prêt »**, puis `Ctrl + C`
pour quitter l'affichage (le serveur continue de tourner).

## 3. Trouver l'adresse du PC

```powershell
ipconfig
```

Ligne **« Adresse IPv4 »** de la carte Wi-Fi, par exemple `192.168.1.19`.

## 4. Sur le téléphone Android (même Wi-Fi)

1. Ouvrir Chrome : `http://192.168.1.19:3001` (votre adresse).
2. Section « L'application » : **Télécharger pour Android**, puis installer (autoriser les applications inconnues si demandé).
3. L'APK fourni vise déjà `http://192.168.1.19:3001`. Si l'adresse du PC change : appui long sur le logo de l'accueil de l'application, puis saisir la nouvelle adresse.

## 5. Premier code de connexion

Tant qu'aucun canal n'est relié, le code d'un nouveau compte s'affiche dans le journal du serveur :

```powershell
docker compose logs api | findstr OTP
```

Ensuite, dans l'application : **Profil > Notifications > Relier Telegram**, appuyer sur « Démarrer » dans
Telegram, puis **M'envoyer un message de test**. Les codes suivants arrivent sur Telegram.

## 6. Comptes fictifs (mot de passe `Demo@2026sx`)

| Rôle | Identifiant |
|---|---|
| Parent | parent@samaxhel.sn |
| Médecin (Keur Xaleyi et CEPIAD) | medecin@samaxhel.sn |
| Secrétaire | secretaire@samaxhel.sn |
| Administrateur Keur Xaleyi | admin.kx@samaxhel.sn |
| Super-administrateur | admin@samaxhel.sn |

Les comptes soignants demandent un code : `docker compose logs api | findstr OTP`, ou Telegram une fois relié.

Chaque établissement partenaire a aussi ses propres comptes, avec son nom dans l'adresse
(même mot de passe). On se connecte depuis **son portail** : Établissements > l'établissement > « Personnel de l'établissement ».

| Établissement | Direction | Accueil | Soignant |
|---|---|---|---|
| CEPIAD | direction@cepiad.samaxhel.sn | accueil@cepiad.samaxhel.sn | medecin@cepiad.samaxhel.sn |
| EducAutisme | direction@educautisme.samaxhel.sn | accueil@educautisme.samaxhel.sn | therapeute@educautisme.samaxhel.sn |
| Keur Xaleyi | direction@keur-xaleyi.samaxhel.sn | accueil@keur-xaleyi.samaxhel.sn | medecin@keur-xaleyi.samaxhel.sn |
| Service Moussa Diop (Fann) | direction@moussa-diop.samaxhel.sn | accueil@moussa-diop.samaxhel.sn | medecin@moussa-diop.samaxhel.sn |

Un compte d'un établissement est refusé sur le portail d'un autre.

**Pages de chaque établissement** (site) : `http://<adresse du PC>:3001/etablissement/cepiad`,
`/etablissement/keur-xaleyi`, `/etablissement/educautisme`, `/etablissement/moussa-diop`.
**Écran de la salle d'attente** (à afficher sur une télévision) : `/etablissement/cepiad/file`.

**Caisse** : connectez-vous avec `accueil@cepiad.samaxhel.sn` → « Caisse et tickets ».
**Appeler le suivant** : `medecin@cepiad.samaxhel.sn` → « Salle d'attente ».

## 7 bis. Mettre à jour (nouvelle version)

1. Remplacez le dossier `C:\SAMA-XHEL` par le contenu du nouveau zip **en gardant votre fichier `serveur\.env`**.
2. Puis :

```powershell
cd C:\SAMA-XHEL\serveur
docker compose up -d --build
```

3. Sur le téléphone : **désinstallez l'ancienne application**, puis retéléchargez-la depuis
   `http://<adresse du PC>:3001/telechargements/SAMA-XHEL-Sante.apk` (ou le QR code du site).

## 7 ter. Lien https temporaire depuis votre PC (secours)

Pour l'hébergement gratuit permanent (Render + Neon), suivez `HEBERGEMENT-GRATUIT.md`.

```powershell
docker compose --profile public up -d
docker compose logs tunnel | findstr trycloudflare
```

L'adresse `https://….trycloudflare.com` affichée ouvre le site, l'application web (`/app`) et l'APK depuis
n'importe où. Elle change à chaque redémarrage : c'est une démonstration, pas l'hébergement définitif.

## 7. Arrêter, relancer, remettre à zéro

```powershell
cd C:\SAMA-XHEL\serveur
docker compose stop
docker compose start
docker compose down -v
```

`down -v` efface la base et les clés de cette machine (tout repart de zéro au prochain démarrage).

## Sécurité

- Le fichier `.env` contient vos identifiants : ne l'envoyez à personne, ne le mettez pas sur GitHub.
- La base de données n'est pas exposée sur le réseau ; seul le port 3001 l'est.
- Les clés de chiffrement sont créées au premier démarrage et restent dans le volume Docker de cette machine.

## 8. Supervision en temps réel

### 8.1 Alertes de sécurité dans l'application
Dès qu'une alerte est levée (compte verrouillé après 5 mots de passe faux, accès anormaux à des
dossiers, journal d'audit modifié), le super-administrateur et la direction de l'hôpital concerné
voient une bannière rouge avec un signal sonore, quel que soit l'écran ouvert.

Pour recevoir aussi les alertes sur Telegram (téléphone qui sonne, application fermée) :
1. créez un groupe Telegram « SAMA XHEL — Alertes » et ajoutez-y votre bot ;
2. écrivez un message dans le groupe, puis ouvrez dans un navigateur
   `https://api.telegram.org/bot<VOTRE_JETON>/getUpdates` : l'identifiant du groupe est le nombre
   négatif après `"chat":{"id":` ;
3. ajoutez dans `serveur\.env` la ligne `TELEGRAM_ALERTES_CHAT_ID=<ce nombre>` ;
4. relancez : `docker compose up -d`.

### 8.2 Uptime Kuma (disponibilité)
Uptime Kuma démarre avec le reste : ouvrez `http://localhost:3002`.
1. Au premier lancement, créez le compte administrateur (nom et mot de passe à vous).
2. « Ajouter une sonde », type **HTTP(s)**, intervalle 60 s, pour chacune de ces adresses :
   - `http://api:3001/health/complet` — API, base de données et Redis ;
   - `http://api:3001/` — site vitrine ;
   - `http://api:3001/app/` — application web.
3. Paramètres → Notifications → **Telegram** : jeton du bot et identifiant du groupe d'alertes ;
   cochez « Activer par défaut » et appliquez à toutes les sondes.
4. (Facultatif) « Pages de statut » : une page publique verte/rouge à afficher sur un écran.

Test devant le jury : `docker compose stop postgres` → la sonde « API » passe au rouge et Telegram
prévient ; `docker compose start postgres` → tout redevient vert.
