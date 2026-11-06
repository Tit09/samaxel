# SAMA XHEL Santé — Backend (API multi-tenant)

API Node.js / Express de l'application **SAMA XHEL Santé** : parents, médecins, thérapeutes, secrétaires et administrateurs de structure.
Chaque établissement (Keur Xaleyi, Éduc'Autisme, Clinique Moussa Diop, CEPIAD…) est un **tenant** qui gère ses propres membres et dossiers ; l'isolation est garantie par **PostgreSQL lui-même** (Row Level Security).

> Le site vitrine (sans backend) utilise l'API publique de ce backend. L'application Jeux a **son propre backend**, indépendant.

---

## 1. Comprendre avant d'installer

| Élément | Rôle |
|---|---|
| **PostgreSQL 16** | base de données ; la RLS empêche une structure de voir les données d'une autre |
| **Redis 7** | codes OTP, jetons de rafraîchissement, sessions fermées |
| **Rôle `samaxhel_app`** | compte utilisé par l'API, **sans** droit de contourner la RLS |
| **Clés ES256** | signent les jetons de connexion (`npm run keys`) |
| **DATA_ENCRYPTION_KEY** | chiffre les données de santé (AES-256-GCM) — **à sauvegarder à part** |

Structure du code :

```
db/migrations/   001 schéma · 002 RLS · 003 fonctions sécurisées + audit chaîné
src/config/      variables d'environnement, PostgreSQL (withContext), Redis
src/middlewares/ authentification + X-Structure-Id, validation, audit, erreurs
src/controllers/ une logique par domaine (auth, enfants, dépistages, suivis, rdv…)
src/ia/          scoring, triage (urgence), orientation, émotion — IA explicable
src/data/        les 7 questionnaires de repérage
src/routes/      TOUTES les routes, leurs droits et leurs validations
tests/           41 tests de bout en bout sur une vraie base
```

## 2. Installation pas à pas (Ubuntu / WSL)

```bash
# 1. Outils
sudo apt update
sudo apt install -y postgresql redis-server curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Base de données
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'MotDePasseAdminFort';"
sudo -u postgres psql -c "CREATE DATABASE samaxhel;"

# 3. Projet
cd sama-xhel-sante-backend
npm ci
cp .env.example .env
```

Ouvrez `.env` et complétez au minimum `DB_ADMIN_PASSWORD`, `APP_DB_PASSWORD`, `DATA_ENCRYPTION_KEY` et `DATA_INDEX_KEY`. Pour générer les deux clés :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
# 4. Clés de signature, tables, sécurité, données de démonstration
npm run keys
npm run migrate
npm run seed

# 5. Démarrer
npm run dev
```

Vérification : `curl http://localhost:3001/health` → `{"status":"ok"…}`.
Au démarrage, la console doit afficher **« connecté en tant que samaxhel_app »**. Si elle avertit que le rôle contourne la RLS, vérifiez `APP_DB_USER`.

### Avec Docker (production)

```bash
npm run keys
docker compose up -d --build
docker compose exec api node scripts/migrate.js
```

## 3. Comptes de démonstration (`npm run seed`)

Mot de passe commun : **`Demo@2026sx`** — en développement (`OTP_CONSOLE=true`), le code MFA s'affiche dans la console du serveur.

| Rôle | Identifiant | Structure |
|---|---|---|
| Super-administrateur | admin@samaxhel.sn | plateforme |
| Admin de structure | admin.kx@samaxhel.sn | Keur Xaleyi |
| Médecin | medecin@samaxhel.sn | Keur Xaleyi **et** CEPIAD (multi-structures) |
| Thérapeute | therapeute@samaxhel.sn | Keur Xaleyi |
| Secrétaire | secretaire@samaxhel.sn | Keur Xaleyi |
| Admin de structure | admin.cepiad@samaxhel.sn | CEPIAD |
| Parent | parent@samaxhel.sn ou 77 000 00 10 | — |

## 4. Tests

```bash
npm test
```

Les tests créent une base `samaxhel_test`, appliquent les migrations et vérifient notamment : MFA, verrouillage après 5 échecs, rotation des jetons, jetons falsifiés, isolation entre structures (y compris par une requête SQL sans filtre), secret médical (secrétaire), accès à la visio, messagerie chiffrée, IA de tri et d'émotion, validation des professionnels, intégrité du journal d'audit.

## 5. Utiliser l'API

Toutes les réponses d'erreur ont la même forme : `{ "error": "message en français", "code": "CODE_STABLE" }`.

En-têtes d'une requête authentifiée :

```
Authorization: Bearer <token>
X-Structure-Id: <id de la structure active>   (professionnels ; facultatif pour un parent)
```

| Domaine | Routes principales |
|---|---|
| Authentification | `POST /api/auth/register` · `register-professionnel` · `verify` · `login` · `mfa/verify` · `refresh` · `logout` · `GET /api/auth/me` |
| Public (site vitrine) | `GET /api/structures` · `GET /api/structures/meta` · `GET /api/questionnaires` · `POST /api/questionnaires/:code/evaluer` · `POST /api/orientation` · `POST /api/dons` · `GET /api/dons/transparence` |
| Parent | `/api/enfants` · `POST /api/depistages` · `POST /api/suivis` · `/api/rendez-vous` · `/api/humeur` · `/api/consentements` · `GET /api/users/me/export` |
| Professionnels | `GET /api/suivis` (file triée par urgence) · `PUT /api/suivis/:id` · `/api/consultations` · `GET /api/ia/tableau-de-bord` · `GET /api/fhir/Patient/:id/$everything` |
| Communs | `/api/conversations` (E2EE) · `GET /api/teleconsultation/:id/join` · `/api/notifications` |
| Admin structure | `/api/admin/membres` · `PUT /api/admin/structure` · `GET /api/admin/statistiques` · `GET /api/admin/audit` |
| Super-admin | `/api/admin/structures` · `POST /api/admin/structures/:id/activer` · `GET /api/admin/audit/verifier` |

## 6. Ce qui a été corrigé par rapport à l'ancienne version

| Ancien problème | Correction |
|---|---|
| Plantage au démarrage (`checkRole` vs `checkrole.js`) | middlewares regroupés dans `auth.js` |
| Consultations et téléconsultation sans `setTenant` → erreur 500 | contexte de sécurité posé dans **chaque** transaction (`withContext`) |
| Aucun schéma SQL | migrations versionnées (`npm run migrate`) |
| Routes `/register`, `/me`, `/refresh` absentes | ajoutées, avec MFA et rotation des jetons |
| Rôles incohérents (`administrateur`, `MEDECIN`, `parent_tuteur`) | rôles uniques : PARENT, MEDECIN, THERAPEUTE, SECRETAIRE, ADMIN_STRUCTURE, SUPER_ADMIN |
| N'importe qui pouvait activer n'importe quel compte | le code est lié au compte, haché, 5 essais maximum |
| Envoi de SMS vers n'importe quel numéro (abus) | le code part uniquement vers le contact du compte |
| N'importe quel utilisateur pouvait rejoindre n'importe quelle visio | accès réservé au parent concerné et aux cliniciens de la structure |
| Numéros de dossier en doublon (`COUNT(*)`) | séquence PostgreSQL |
| Index des noms en SHA-256 simple (réversible par dictionnaire) | HMAC-SHA256 avec clé secrète |
| Clé de chiffrement envoyée à PostgreSQL (pgcrypto) | chiffrement AES-256-GCM dans l'application |
| `.env` avec les vrais secrets dans le zip | `.env.example` + `.gitignore` — **changez vos anciens secrets** |
| SDK Africa's Talking vulnérable (`npm audit`) | appel direct à l'API REST : 0 vulnérabilité |
