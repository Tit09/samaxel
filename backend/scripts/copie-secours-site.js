'use strict';
/**
 * Régénère la copie de secours du site vitrine (site-vitrine/data/structures.js)
 * à partir de l'annuaire en base. Usage : node scripts/copie-secours-site.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const request = require('supertest');
const app = require('../src/app');

(async () => {
  const meta = (await request(app).get('/api/structures/meta')).body;
  const { structures } = (await request(app).get('/api/structures').query({ limit: 500 })).body;
  const jour = new Date().toISOString().slice(0, 10);
  const note = 'Copie de secours de l’annuaire national de santé mentale, utilisée seulement si l’API ne répond pas. Sources officielles citées dans chaque fiche.';
  const sortie = path.join(__dirname, '..', '..', 'site-vitrine', 'data', 'structures.js');
  fs.writeFileSync(sortie, `/* ${note} (${jour}) */\nwindow.SAMA_SECOURS = ${JSON.stringify({ genere_le: jour, note, meta, structures })};\n`);
  console.log(`[Site] ${structures.length} structures écrites dans ${path.relative(process.cwd(), sortie)}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
