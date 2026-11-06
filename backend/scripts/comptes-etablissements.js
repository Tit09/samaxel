'use strict';
/**
 * Comptes de démonstration AU NOM DE CHAQUE ÉTABLISSEMENT partenaire (données fictives).
 * Chaque établissement a ses propres identifiants et se connecte par SON portail :
 *     direction@<code>.samaxhel.sn  (administrateur de l'établissement)
 *     accueil@<code>.samaxhel.sn    (secrétariat)
 *     medecin@<code>.samaxhel.sn    (médecin ; thérapeute pour Éduc'Autisme)
 * Mot de passe commun de démonstration : Demo@2026sx — code de sécurité à chaque connexion.
 * Le personnel RÉEL est ensuite invité par l'administrateur (Équipe > Inviter) : il crée
 * lui-même son compte et son mot de passe.
 * Usage : node scripts/comptes-etablissements.js   (idempotent)
 */
const path = require('path');
const { Client } = require('pg');
const argon2 = require('argon2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const env = require('../src/config/env');

const ETABLISSEMENTS = {
  'keur-xaleyi': { medecin: ['MEDECIN', 'Fatou', 'Ndiaye', 'pédopsychiatre'], bureau: 'Pavillon Keur Xaleyi, bureau 2' },
  'moussa-diop': { medecin: ['MEDECIN', 'Mamadou', 'Sow', 'psychiatre'], bureau: 'Clinique Moussa Diop, salle d’attente 1' },
  cepiad: { medecin: ['MEDECIN', 'Ibrahima', 'Diallo', 'addictologue'], bureau: 'CEPIAD, accueil puis bureau 4' },
  educautisme: { medecin: ['THERAPEUTE', 'Awa', 'Diop', 'éducatrice spécialisée'], bureau: 'Salle d’évaluation' },
};

// Tarifs de DÉMONSTRATION (fictifs) : chaque établissement les remplace par sa grille officielle.
const TARIFS = [
  ['ticket-consultation', 'Ticket de consultation', 3000, 'A'],
  ['premiere-consultation', 'Première consultation (ouverture du dossier)', 5000, 'N'],
  ['bilan', 'Bilan / évaluation spécialisée', 10000, 'B'],
  ['seance', 'Séance de suivi (thérapie, orthophonie…)', 5000, 'S'],
];

async function creerComptes(db) {
  const hash = await argon2.hash('Demo@2026sx', { type: argon2.argon2id, ...env.argon2 });
  const crees = [];
  for (const [code, conf] of Object.entries(ETABLISSEMENTS)) {
    const { rows: [st] } = await db.query('SELECT id, sigle, nom FROM structures WHERE code = $1', [code]);
    if (!st) continue;
    const comptes = [
      ['direction', 'ADMIN_STRUCTURE', 'Direction', st.sigle || code, null],
      ['accueil', 'SECRETAIRE', 'Accueil', st.sigle || code, null],
      [conf.medecin[0] === 'MEDECIN' ? 'medecin' : 'therapeute', conf.medecin[0], conf.medecin[1], conf.medecin[2], conf.medecin[3]],
    ];
    for (const [local, role, prenom, nom, specialite] of comptes) {
      const email = `${local}@${code}.samaxhel.sn`;
      const { rows: [u] } = await db.query(
        `INSERT INTO users (role_global, nom, prenom, email, password_hash, verifie, mfa_enabled, langue)
         VALUES ('PROFESSIONNEL', $1, $2, $3, $4, true, true, 'fr')
         ON CONFLICT ((lower(email))) WHERE email IS NOT NULL DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
        [nom, prenom, email, hash]);
      await db.query(
        `INSERT INTO membres_structure (user_id, structure_id, role, specialite, statut)
         VALUES ($1, $2, $3, $4, 'ACTIF') ON CONFLICT (user_id, structure_id) DO UPDATE SET role = EXCLUDED.role, statut = 'ACTIF'`,
        [u.id, st.id, role, specialite]);
      crees.push(email);
    }
    for (const [tcode, libelle, montant, prefixe] of TARIFS) {
      await db.query(
        `INSERT INTO tarifs (structure_id, code, libelle, montant, prefixe, orientation)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (structure_id, code) DO NOTHING`,
        [st.id, tcode, libelle, montant, prefixe, conf.bureau]);
    }
  }
  return crees;
}

module.exports = { creerComptes, ETABLISSEMENTS };

if (require.main === module) {
  const db = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD });
  db.connect().then(() => creerComptes(db)).then((l) => { console.log(`[Comptes] ${l.length} comptes d'établissement :\n  ${l.join('\n  ')}`); return db.end(); })
    .catch((e) => { console.error('[Comptes] Échec :', e.message); process.exit(1); });
}
