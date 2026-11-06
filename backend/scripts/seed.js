'use strict';
/**
 * Données de démonstration : structures partenaires, annuaire national, comptes de test.
 * Usage : npm run seed     (base vide ; à NE PAS lancer en production)
 *
 * ⚠ Coordonnées GPS : centre-ville approximatif pour les hôpitaux régionaux
 *   (champ « source »). À remplacer par les coordonnées exactes relevées sur le terrain.
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const argon2 = require('argon2');
const env = require('../src/config/env');
const { chiffrer, indexAveugle } = require('../src/utils/crypto');

const MDP_DEMO = 'Demo@2026sx';
const APPROX = 'Coordonnées approximatives (centre-ville) — à vérifier sur le terrain';

const TOUS_TND = ['TSA', 'TDAH', 'DI', 'LANGAGE', 'DYS', 'MOTEUR', 'EPILEPSIE', 'ANXIETE', 'DEPRESSION'];
const PSY = ['PSYCHIATRIE_ADULTE', 'DEPRESSION', 'ANXIETE', 'ADDICTION'];

const PARTENAIRES = [
  {
    cle: 'kx', nom: 'Service de pédopsychiatrie Keur Xaleyi', sigle: 'Keur Xaleyi', type: 'CENTRE_SPECIALISE',
    secteur: 'PUBLIC', region: 'Dakar', commune: 'Fann', adresse: 'CHNU de Fann, Dakar',
    latitude: 14.6920, longitude: -17.4645, troubles: TOUS_TND,
    services: ['DIAGNOSTIC', 'PEDOPSYCHIATRIE', 'PSYCHOLOGIE', 'ORTHOPHONIE', 'PSYCHOMOTRICITE', 'GUIDANCE_PARENTALE', 'TELECONSULTATION'],
    age_min_mois: 0, age_max_mois: 216, cout_niveau: 1, delai_attente_jours: 45,
    description: 'Structure publique de référence pour la santé mentale des enfants et adolescents (0 à 18 ans).',
  },
  {
    cle: 'ea', nom: 'Éduc’Autisme', sigle: 'Éduc’Autisme', type: 'ASSOCIATION', secteur: 'ASSOCIATIF',
    region: 'Dakar', commune: 'Dakar', troubles: ['TSA', 'DI', 'LANGAGE'],
    services: ['EDUCATION_SPECIALISEE', 'PSYCHOMOTRICITE', 'ORTHOPHONIE', 'GUIDANCE_PARENTALE', 'SCOLARISATION'],
    age_min_mois: 24, age_max_mois: 216, cout_niveau: 2, delai_attente_jours: 30,
    description: 'Prise en charge médico-éducative des enfants atteints d’autisme modéré à sévère.',
    source: 'Adresse et coordonnées à compléter',
  },
  {
    cle: 'md', nom: 'Clinique psychiatrique Moussa Diop', sigle: 'Moussa Diop', type: 'HOPITAL', secteur: 'PUBLIC',
    region: 'Dakar', commune: 'Fann', adresse: 'CHNU de Fann, Dakar', latitude: 14.6928, longitude: -17.4639,
    troubles: PSY, services: ['DIAGNOSTIC', 'PSYCHIATRIE', 'PSYCHOLOGIE', 'TELECONSULTATION'],
    age_min_mois: 192, age_max_mois: 1200, cout_niveau: 1, delai_attente_jours: 21,
    description: 'Référence nationale en psychiatrie adulte, au sein du pôle psychiatrique de Fann (créé en 1956).',
  },
  {
    cle: 'cp', nom: 'Centre de Prise en charge Intégrée des Addictions de Dakar', sigle: 'CEPIAD', type: 'CENTRE_ADDICTOLOGIE',
    secteur: 'PUBLIC', region: 'Dakar', commune: 'Fann', adresse: 'CHNU de Fann, Dakar', latitude: 14.6935, longitude: -17.4655,
    troubles: ['ADDICTION', 'DEPRESSION', 'ANXIETE'], services: ['ADDICTOLOGIE', 'PSYCHOLOGIE', 'PSYCHIATRIE'],
    age_min_mois: 144, age_max_mois: 1200, cout_niveau: 0, delai_attente_jours: 7,
    description: 'Traitement des addictions, réduction des risques et comorbidités psychiatriques.',
  },
];

// Annuaire national (liste du site vitrine) — à compléter et vérifier
const ANNUAIRE = [
  ['Centre Hospitalier National Psychiatrique de Thiaroye', 'HOPITAL', 'Dakar', 'Pikine', 14.7486, -17.3810, PSY],
  ['Hôpital Principal de Dakar — Service de psychiatrie', 'HOPITAL', 'Dakar', 'Plateau', 14.6618, -17.4383, PSY],
  ['Centre de santé mentale Dalal Xel de Thiès', 'CENTRE_SPECIALISE', 'Thiès', 'Thiès', 14.7910, -16.9359, [...PSY, 'EPILEPSIE']],
  ['Hôpital régional de Thiès — Service de psychiatrie', 'HOPITAL', 'Thiès', 'Thiès', 14.7886, -16.9260, PSY],
  ['Centre de santé mentale Dalal Xel de Fatick', 'CENTRE_SPECIALISE', 'Fatick', 'Fatick', 14.3390, -16.4111, [...PSY, 'EPILEPSIE']],
  ['Hôpital régional de Saint-Louis — Service de psychiatrie', 'HOPITAL', 'Saint-Louis', 'Saint-Louis', 16.0179, -16.4896, PSY],
  ['Centre hospitalier régional de Richard-Toll', 'HOPITAL', 'Saint-Louis', 'Richard-Toll', 16.4625, -15.7008, PSY],
  ['Hôpital régional Heinrich Lübke de Diourbel', 'HOPITAL', 'Diourbel', 'Diourbel', 14.6550, -16.2314, PSY],
  ['Hôpital Matlaboul Fawzeini de Touba', 'HOPITAL', 'Diourbel', 'Touba', 14.8500, -15.8833, PSY],
  ['Hôpital régional El Hadji Ibrahima Niass de Kaolack', 'HOPITAL', 'Kaolack', 'Kaolack', 14.1652, -16.0726, PSY],
  ['Hôpital régional de Ziguinchor', 'HOPITAL', 'Ziguinchor', 'Ziguinchor', 12.5681, -16.2719, PSY],
  ['Hôpital de la Paix de Ziguinchor', 'HOPITAL', 'Ziguinchor', 'Ziguinchor', 12.5560, -16.2830, PSY],
  ['Hôpital régional de Tambacounda', 'HOPITAL', 'Tambacounda', 'Tambacounda', 13.7707, -13.6673, PSY],
  ['Hôpital régional Amadou Sakhir Mbaye de Louga', 'HOPITAL', 'Louga', 'Louga', 15.6144, -16.2286, PSY],
  ['Hôpital régional de Kolda', 'HOPITAL', 'Kolda', 'Kolda', 12.8939, -14.9406, PSY],
  ['Hôpital régional de Matam', 'HOPITAL', 'Matam', 'Matam', 15.6559, -13.2554, PSY],
  ['Hôpital régional Amath Dansokho de Kédougou', 'HOPITAL', 'Kédougou', 'Kédougou', 12.5556, -12.1743, PSY],
  ['Hôpital régional de Sédhiou', 'HOPITAL', 'Sédhiou', 'Sédhiou', 12.7081, -15.5569, PSY],
  ['Hôpital régional Thierno Birahim Ndao de Kaffrine', 'HOPITAL', 'Kaffrine', 'Kaffrine', 14.1059, -15.5508, PSY],
];

async function main() {
  const db = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD,
  });
  await db.connect();
  const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM users');
  if (n > 0 && !process.argv.includes('--force')) {
    console.log('[Seed] La base contient déjà des utilisateurs — rien n’est fait (ajoutez --force).');
    await db.end(); return;
  }
  const hash = await argon2.hash(MDP_DEMO, { type: argon2.argon2id, ...env.argon2 });

  // Structures partenaires
  const ids = {};
  for (const s of PARTENAIRES) {
    const { rows: [r] } = await db.query(
      `INSERT INTO structures (nom, sigle, type, secteur, region, commune, adresse, latitude, longitude, troubles, services,
         age_min_mois, age_max_mois, cout_niveau, delai_attente_jours, description, partenaire, verifie, source, langues)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,true,$17,'{fr,wo,ff,srr}') RETURNING id`,
      [s.nom, s.sigle, s.type, s.secteur, s.region, s.commune, s.adresse || null, s.latitude ?? null, s.longitude ?? null,
        s.troubles, s.services, s.age_min_mois, s.age_max_mois, s.cout_niveau, s.delai_attente_jours, s.description,
        s.source || 'Structure partenaire (étude de terrain)']);
    ids[s.cle] = r.id;
  }
  for (const [nom, type, region, commune, la, lo, troubles] of ANNUAIRE) {
    await db.query(
      `INSERT INTO structures (nom, type, secteur, region, commune, latitude, longitude, troubles, services,
         age_min_mois, cout_niveau, source)
       VALUES ($1,$2,'PUBLIC',$3,$4,$5,$6,$7,'{PSYCHIATRIE,PSYCHOLOGIE}', 0, 1, $8)`,
      [nom, type, region, commune, la, lo, troubles, APPROX]);
  }

  // Comptes de démonstration
  const user = async (role_global, prenom, nom, email, tel, mfa = false) => (await db.query(
    `INSERT INTO users (role_global, prenom, nom, email, telephone, password_hash, verifie, mfa_enabled, langue)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7,'fr') RETURNING id`,
    [role_global, prenom, nom, email, tel, hash, mfa])).rows[0].id;
  const membre = (u, s, role, spe) => db.query(
    "INSERT INTO membres_structure (user_id, structure_id, role, specialite, statut) VALUES ($1,$2,$3,$4,'ACTIF')",
    [u, s, role, spe]);

  await user('SUPER_ADMIN', 'Admin', 'SAMA XHEL', 'admin@samaxhel.sn', '+221770000000', true);
  const adminKx = await user('PROFESSIONNEL', 'Awa', 'Ndiaye', 'admin.kx@samaxhel.sn', '+221770000001', true);
  const medecin = await user('PROFESSIONNEL', 'Moussa', 'Sarr', 'medecin@samaxhel.sn', '+221770000002', true);
  const thera = await user('PROFESSIONNEL', 'Fatou', 'Diop', 'therapeute@samaxhel.sn', '+221770000003', true);
  const secr = await user('PROFESSIONNEL', 'Mariama', 'Ba', 'secretaire@samaxhel.sn', '+221770000004', true);
  const adminCp = await user('PROFESSIONNEL', 'Ibrahima', 'Fall', 'admin.cepiad@samaxhel.sn', '+221770000005', true);
  await membre(adminKx, ids.kx, 'ADMIN_STRUCTURE', 'Direction');
  await membre(medecin, ids.kx, 'MEDECIN', 'Pédopsychiatre');
  await membre(medecin, ids.cp, 'MEDECIN', 'Psychiatre');          // multi-structures (F8)
  await membre(thera, ids.kx, 'THERAPEUTE', 'Orthophoniste');
  await membre(secr, ids.kx, 'SECRETAIRE', 'Accueil');
  await membre(adminCp, ids.cp, 'ADMIN_STRUCTURE', 'Direction');

  const parent = await user('PARENT', 'Aminata', 'Diallo', 'parent@samaxhel.sn', '+221770000010');
  await db.query(
    "UPDATE users SET langue = 'wo', region = 'Dakar' WHERE id = $1", [parent]);
  for (const type of ['CGU', 'DONNEES_SANTE', 'IA_ANALYSE']) {
    await db.query('INSERT INTO consentements (parent_id, type, accepte) VALUES ($1,$2,true)', [parent, type]);
  }
  await db.query(
    `INSERT INTO enfants (parent_id, prenom_chiffre, nom_chiffre, nom_index, date_naissance_chiffre, mois_naissance, sexe, region, langue_maison)
     VALUES ($1,$2,$3,$4,$5,$6,'M','Dakar','wo')`,
    [parent, chiffrer('Ousmane'), chiffrer('Diallo'), indexAveugle('Diallo'), chiffrer('2023-11-14'), '2023-11-01']);

  // eslint-disable-next-line global-require
  await require('./photos').appliquerPhotos(db);
  console.log('[Seed] ✔ 4 structures partenaires, %d structures d’annuaire, 8 comptes', ANNUAIRE.length);
  console.log(`[Seed] Mot de passe de tous les comptes de démonstration : ${MDP_DEMO}`);
  console.log('        super-admin  admin@samaxhel.sn       | admin Keur Xaleyi  admin.kx@samaxhel.sn');
  console.log('        médecin      medecin@samaxhel.sn     | thérapeute         therapeute@samaxhel.sn');
  console.log('        secrétaire   secretaire@samaxhel.sn  | admin CEPIAD       admin.cepiad@samaxhel.sn');
  console.log('        parent       parent@samaxhel.sn  (ou +221770000010)');
  await db.end();
}

main().catch((err) => { console.error('[Seed] Échec :', err.message); process.exit(1); });
