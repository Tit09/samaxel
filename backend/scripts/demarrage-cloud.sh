#!/bin/sh
# Démarrage sur un hébergeur en ligne (Render) : le disque est effacé à chaque redémarrage,
# donc les clés viennent des variables d'environnement et la base (Neon) garde tout.
#   1. migrations (idempotentes) ;
#   2. si la base est vide : données FICTIVES de démonstration et annuaire national ;
#   3. API + site + application web + APK sur le port donné par l'hébergeur.
set -e
node scripts/migrate.js
if [ "$(node scripts/base-vide.js)" = "oui" ]; then
  echo "[SAMA XHEL] Base vide : comptes fictifs, pharmacies et annuaire national…"
  node scripts/seed.js
  node scripts/import-osm.js
  node scripts/import-annuaire.js
  node scripts/comptes-etablissements.js
fi
exec node src/server.js
