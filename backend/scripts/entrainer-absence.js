'use strict';
/**
 * Ré-estime les coefficients du modèle de risque d'absence (src/ia/absence.js)
 * sur l'historique RÉEL des rendez-vous (TERMINE = venu, ABSENT = pas venu).
 *
 *  • Régression logistique par descente de gradient, régularisation L2 légère.
 *  • Validation : 80 % des rendez-vous pour apprendre, 20 % pour mesurer (exactitude, AUC).
 *  • N'écrit rien tant qu'il n'y a pas au moins 200 rendez-vous terminés ou manqués.
 *  • Résultat : data/modele-absence.json (lu au démarrage s'il existe).
 *
 * Usage : node scripts/entrainer-absence.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { caracteristiques, COEFFICIENTS } = require('../src/ia/absence');

const MIN_EXEMPLES = 200;
const sigmoide = (z) => 1 / (1 + Math.exp(-z));

function entrainer(X, y, cles, { pas = 0.5, iterations = 5000, l2 = 0.001 } = {}) {
  const w = Object.fromEntries(cles.map((k) => [k, 0]));
  let b = 0;
  for (let it = 0; it < iterations; it++) {
    const g = Object.fromEntries(cles.map((k) => [k, 0])); let gb = 0;
    X.forEach((x, i) => {
      const e = sigmoide(b + cles.reduce((s, k) => s + w[k] * x[k], 0)) - y[i];
      cles.forEach((k) => { g[k] += e * x[k]; });
      gb += e;
    });
    cles.forEach((k) => { w[k] -= pas * (g[k] / X.length + l2 * w[k]); });
    b -= pas * (gb / X.length);
  }
  return { constante: b, ...w };
}

function auc(scores, y) {
  const pos = scores.filter((_, i) => y[i] === 1); const neg = scores.filter((_, i) => y[i] === 0);
  if (!pos.length || !neg.length) return null;
  let n = 0;
  for (const p of pos) for (const q of neg) n += p > q ? 1 : p === q ? 0.5 : 0;
  return n / (pos.length * neg.length);
}

async function main() {
  const db = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD });
  await db.connect();
  // Pour chaque rendez-vous passé : son issue, et la situation de la famille AVANT ce rendez-vous
  const { rows } = await db.query(`
    SELECT r.type, r.statut,
           extract(epoch FROM (r.date_confirmee - r.created_at)) / 86400 AS delai_jours,
           (SELECT count(*) FROM rendez_vous x WHERE x.parent_id = r.parent_id AND x.statut = 'ABSENT' AND x.date_confirmee < r.date_confirmee)::int AS absences,
           (SELECT count(*) FROM rendez_vous x WHERE x.parent_id = r.parent_id AND x.statut = 'TERMINE' AND x.date_confirmee < r.date_confirmee)::int AS honores,
           NOT EXISTS (SELECT 1 FROM rendez_vous x WHERE x.parent_id = r.parent_id AND x.structure_id = r.structure_id
                         AND x.statut = 'TERMINE' AND x.date_confirmee < r.date_confirmee) AS premier,
           u.telegram_chat_id IS NOT NULL AS telegram, u.whatsapp_accepte AS whatsapp, 0 AS derniere_connexion_jours
      FROM rendez_vous r JOIN users u ON u.id = r.parent_id
     WHERE r.statut IN ('TERMINE', 'ABSENT') AND r.date_confirmee IS NOT NULL`);
  await db.end();

  console.log(`[Absence] ${rows.length} rendez-vous passés (minimum requis : ${MIN_EXEMPLES})`);
  if (rows.length < MIN_EXEMPLES) {
    console.log('[Absence] Pas assez de données réelles : les coefficients initiaux restent en place.');
    return;
  }
  const cles = Object.keys(COEFFICIENTS).filter((k) => k !== 'constante');
  const donnees = rows.map((r) => ({ x: caracteristiques(r), y: r.statut === 'ABSENT' ? 1 : 0 }))
    .sort(() => Math.random() - 0.5);
  const coupe = Math.floor(donnees.length * 0.8);
  const app = donnees.slice(0, coupe); const val = donnees.slice(coupe);
  const coef = entrainer(app.map((d) => d.x), app.map((d) => d.y), cles);
  const scores = val.map((d) => sigmoide(coef.constante + cles.reduce((s, k) => s + coef[k] * d.x[k], 0)));
  const exactitude = scores.filter((s, i) => (s >= 0.5 ? 1 : 0) === val[i].y).length / val.length;
  const a = auc(scores, val.map((d) => d.y));
  console.log(`[Absence] Validation : exactitude ${(exactitude * 100).toFixed(1)} %, AUC ${a?.toFixed(3) ?? 'n/a'}`);
  const sortie = path.join(__dirname, '..', 'data', 'modele-absence.json');
  fs.writeFileSync(sortie, JSON.stringify({ entraine_le: new Date().toISOString(), exemples: rows.length, exactitude, auc: a, coefficients: coef }, null, 2));
  console.log(`[Absence] Coefficients écrits dans ${path.relative(process.cwd(), sortie)}`);
}

module.exports = { entrainer, auc };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
