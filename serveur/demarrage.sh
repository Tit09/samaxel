#!/bin/sh
# Démarrage du serveur SAMA XHEL (même script sur le PC de test et sur le serveur en ligne).
#  1. Clés propres à CETTE machine, générées au premier démarrage, jamais copiées ailleurs.
#  2. Base de données : migrations, puis (une seule fois) données FICTIVES et annuaire national.
#  3. API + site vitrine + téléchargement de l'APK, sur le port 3001.
set -e
D=/app/donnees
if [ ! -f "$D/cles.env" ]; then
  gen() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
  { echo "DATA_ENCRYPTION_KEY=$(gen)"; echo "DATA_INDEX_KEY=$(gen)"; echo "APP_DB_PASSWORD=$(gen)"; echo "TELEGRAM_WEBHOOK_SECRET=$(gen)"; } > "$D/cles.env"
  chmod 600 "$D/cles.env"
  echo "[SAMA XHEL] Clés de chiffrement créées pour cette machine."
fi
set -a; . "$D/cles.env"; set +a
node scripts/generate-keys.js
node scripts/migrate.js
if [ ! -f "$D/.initialise" ]; then
  echo "[SAMA XHEL] Premier démarrage : comptes fictifs, pharmacies et annuaire national…"
  node scripts/seed.js
  node scripts/import-osm.js
  node scripts/import-annuaire.js
  node scripts/comptes-etablissements.js
  touch "$D/.initialise"
fi
echo "════════════════════════════════════════════════════════════════"
echo " SAMA XHEL est prêt."
echo "   Sur cet ordinateur : http://localhost:3001"
echo "   Sur le téléphone   : http://ADRESSE-IP-DU-PC:3001  (commande ipconfig)"
echo " Comptes fictifs : parent@samaxhel.sn … mot de passe Demo@2026sx"
echo "════════════════════════════════════════════════════════════════"
exec node src/server.js
