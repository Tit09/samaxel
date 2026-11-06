# Mettre SAMA XHEL en ligne gratuitement (pour la soutenance)

Résultat : une adresse fixe `https://sama-xhel.onrender.com` qui ouvre le site, l'application web
(`/app`), la page de chaque hôpital (`/etablissement/cepiad`) et l'APK, **sans votre PC allumé**.

| Service | Rôle | Prix | Carte bancaire |
|---|---|---|---|
| GitHub | garde le code | gratuit | non |
| Neon | base PostgreSQL 16 (avec la sécurité RLS) | gratuit, sans date de fin | non |
| Render | fait tourner le serveur + Redis | gratuit | non |
| Brevo (facultatif) | e-mails de code | 300 e-mails/jour gratuits | non |

Limites à connaître (et à dire au jury) : sans visite pendant 15 minutes, le serveur s'endort ;
la première visite le réveille en ~1 minute. **Le matin de la soutenance, ouvrez le site 5 minutes
avant** : il restera éveillé tant que vous l'utilisez. Les codes de connexion partent par
Telegram (gratuit) ; le SMTP (Gmail) est bloqué sur Render gratuit, d'où Brevo pour les e-mails.

---

## Étape 1 — Mettre le code sur GitHub (10 min)

1. Créez un compte sur https://github.com puis **New repository** → nom `sama-xhel` → **Private** → Create.
2. Sur votre PC, dans PowerShell :

```powershell
cd C:\SAMA-XHEL
git init
git add backend site-vitrine Dockerfile render.yaml .gitignore serveur
git commit -m "SAMA XHEL"
git branch -M main
git remote add origin https://github.com/VOTRE-NOM/sama-xhel.git
git push -u origin main
```

Le fichier `.gitignore` empêche d'envoyer vos secrets (`.env`, clés). Vérifiez sur GitHub qu'aucun
fichier `.env` n'apparaît.

## Étape 2 — La base de données Neon (5 min)

1. https://neon.tech → **Sign up with GitHub**.
2. **Create project** : nom `sama-xhel`, version **PostgreSQL 16**, région **AWS Europe (Frankfurt)**.
3. **Connect** → onglet **Parameters only** : notez `PGHOST`, `PGUSER`, `PGPASSWORD` (base `neondb`).

## Étape 3 — Les secrets (sur VOTRE PC, 1 min)

```powershell
cd C:\SAMA-XHEL\backend
node scripts/secrets-render.js
```

Six lignes s'affichent (`DATA_ENCRYPTION_KEY=…`, `JWT_PRIVATE_KEY=…`…). Gardez-les dans un endroit
sûr : si la clé de chiffrement est perdue, les données chiffrées ne se relisent plus.

## Étape 4 — Render (10 min)

1. https://render.com → **Get started** → **Sign up with GitHub**.
2. **New +** → **Blueprint** → choisissez le dépôt `sama-xhel` → Render lit `render.yaml`
   (un service web `sama-xhel` + un Redis `sama-xhel-redis`).
3. Render demande les valeurs marquées « sync: false » :

| Variable | Valeur |
|---|---|
| `DB_HOST` | le `PGHOST` de Neon |
| `DB_ADMIN_USER` | le `PGUSER` de Neon (ex. `neondb_owner`) |
| `DB_ADMIN_PASSWORD` | le `PGPASSWORD` de Neon |
| `APP_DB_PASSWORD`, `DATA_ENCRYPTION_KEY`, `DATA_INDEX_KEY`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `TELEGRAM_WEBHOOK_SECRET` | les 6 lignes de l'étape 3 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | ceux de votre bot (comme dans votre `.env`) |
| `COMMUNAUTE_TELEGRAM_URL`, `COMMUNAUTE_WHATSAPP_URL` | les liens de vos groupes |
| `BREVO_API_KEY`, `MAIL_FROM` | facultatif (étape 5) |

4. **Apply**. Le premier déploiement dure ~5 minutes : il crée les tables, la sécurité RLS, les
   comptes fictifs, l'annuaire et les tarifs de démonstration.
5. Ouvrez `https://sama-xhel.onrender.com` (si Render a donné un autre nom, envoyez-le-moi :
   je reconstruis l'APK avec la bonne adresse).

## Étape 5 — E-mails (facultatif)

https://www.brevo.com → compte gratuit → **SMTP & API** → **API Keys** → *Generate*. Collez la clé
dans `BREVO_API_KEY` et `MAIL_FROM` = `SAMA XHEL <votre.adresse@gmail.com>` (adresse vérifiée chez Brevo).

## Mettre à jour plus tard

```powershell
git add -A
git commit -m "Mise à jour"
git push
```

Render redéploie tout seul.

## Pourquoi c'est sérieux devant le jury

- **Mêmes protections qu'en local** : RLS PostgreSQL, chiffrement AES-256-GCM, jetons ES256,
  HTTPS automatique (Let's Encrypt), secrets hors du code.
- **Données fictives uniquement** jusqu'à l'autorisation de la CDP.
- **Après le mémoire** : hébergement au Sénégal (voir le document « Technologies et sécurité »).
