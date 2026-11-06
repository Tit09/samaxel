'use strict';
/**
 * Annuaire national de santé mentale (data/annuaire_sante_mentale.csv, sources officielles citées).
 *
 *  • Met à jour les fiches existantes (même nom, ou alias connu) ; crée les fiches manquantes.
 *  • Donne à chaque établissement un CODE de portail (ex. « cepiad », « keur-xaleyi »).
 *  • Crée l'établissement « CHNU de Fann » et y rattache Keur Xaleyi, Moussa Diop, le CEPIAD
 *    et la neurologie : chacun garde son portail et ses données.
 *  • Logo seulement pour les structures partenaires ; les autres ont l'icône hôpital générique
 *    (logo_url NULL → l'application dessine l'icône).
 *  • Les téléphones et adresses « proposés par IA (à vérifier) » ne sont JAMAIS importés.
 *  • Les points OpenStreetMap qui ne relèvent pas de la santé mentale (cases de santé,
 *    cabinets dentaires…) sont désactivés : ils restent en base mais sortent de l'annuaire.
 *
 * Usage : node scripts/import-annuaire.js   (idempotent)
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const CSV = path.join(__dirname, '..', 'data', 'annuaire_sante_mentale.csv');

// ── Lecture CSV (guillemets, virgules dans les champs) ─────────────────────
function lireCsv(texte) {
  const lignes = []; let champ = ''; let ligne = []; let guill = false;
  texte = texte.replace(/^﻿/, '');
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guill) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') guill = false; else champ += c;
    } else if (c === '"') guill = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.some((x) => x.trim())) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [entete, ...corps] = lignes;
  return corps.map((l) => Object.fromEntries(entete.map((h, i) => [h.trim(), (l[i] || '').trim()])));
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Code court et lisible : « Service de psychiatrie du Centre hospitalier régional de Kaolack » → « psychiatrie-chr-kaolack »
const VIDES = new Set(['d', 'l', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'service', 'pour', 'ex', 'a', 'au', 'en']);
const ABREV = [[/centre hospitalier regional/g, 'chr'], [/centre hospitalier national/g, 'chn'], [/centre hospitalier/g, 'ch'],
  [/hopital regional/g, 'hr'], [/centre de sante mentale/g, 'csm'], [/centre psychiatrique/g, 'cp'], [/centre de sante/g, 'cs'],
  [/hopital general/g, 'hg'], [/hopital/g, 'hop'], [/ecole elementaire publique/g, 'ecole']];
function slug(s) {
  let n = norm((s || '').replace(/[’'`]/g, ' '));
  for (const [re, r] of ABREV) n = n.replace(re, r);
  const mots = n.split(' ').filter((m) => m && !VIDES.has(m));
  let out = '';
  for (const m of mots) { if ((out + '-' + m).length > 32) break; out = out ? `${out}-${m}` : m; }
  return out || (mots[0] || 'structure').slice(0, 32);
}

// Noms historiques déjà en base (données de démonstration) → nom officiel du CSV
const ALIAS = {
  [norm('Hôpital Principal de Dakar — Service de psychiatrie')]: "Service de psychiatrie (Pavillon France) de l'Hôpital Principal de Dakar",
  [norm('Hôpital régional de Thiès — Service de psychiatrie')]: 'Service de psychiatrie du Centre hospitalier régional de Thiès',
  [norm('Hôpital régional de Saint-Louis — Service de psychiatrie')]: "Service de psychiatrie de l'Hôpital régional de Saint-Louis",
  [norm('Hôpital Matlaboul Fawzeini de Touba')]: 'Service de psychiatrie du Centre hospitalier Matlaboul Fawzeyni de Touba',
  [norm('Hôpital régional Amadou Sakhir Mbaye de Louga')]: 'Service de psychiatrie du Centre hospitalier régional Amadou Sakhir Mbaye de Louga',
  [norm('Hôpital régional de Ziguinchor')]: 'Service de psychiatrie du Centre hospitalier régional de Ziguinchor',
  [norm('Hôpital régional El Hadji Ibrahima Niass de Kaolack')]: 'Service de psychiatrie du Centre hospitalier régional de Kaolack',
  [norm('Hôpital régional de Sédhiou')]: 'Service de psychiatrie du Centre hospitalier régional de Sédhiou',
  [norm('Hôpital régional de Tambacounda')]: 'Centre psychiatrique régional de Tambacounda (Djinkoré)',
  [norm('Centre de Prise en charge Intégrée des Addictions de Dakar')]: "Centre de prise en charge intégrée des addictions de Dakar",
  [norm('Éduc’Autisme')]: 'EducAutisme',
};

// Codes de portail lisibles pour les établissements les plus connus
const CODES = {
  'Clinique psychiatrique Moussa Diop': 'moussa-diop',
  'Service de pédopsychiatrie Keur Xaleyi': 'keur-xaleyi',
  "Centre de prise en charge intégrée des addictions de Dakar": 'cepiad',
  'Service de neurologie du CHNU de Fann': 'fann-neurologie',
  'Centre hospitalier national psychiatrique de Thiaroye': 'thiaroye',
  "Service de psychiatrie (Pavillon France) de l'Hôpital Principal de Dakar": 'hpd-psychiatrie',
  'EducAutisme': 'educautisme',
  'Centre Talibou Dabo': 'talibou-dabo',
  'Centre Aminata Mbaye': 'aminata-mbaye',
  "Service de psychiatrie de l'Hôpital général Idrissa Pouye": 'hogip-psychiatrie',
};

// Logos des partenaires seulement (fichiers servis par l'API sous /media)
const LOGOS = {
  "Centre de prise en charge intégrée des addictions de Dakar": ['/media/structures/cepiad_logo.png', '#27355F'],
  'EducAutisme': ['/media/structures/educautisme_logo.png', '#8A3B12'],
  'Clinique psychiatrique Moussa Diop': [null, '#1F5E8C'],
  'Service de pédopsychiatrie Keur Xaleyi': [null, '#1F7A3E'],
};
const PHOTOS = {
  'Clinique psychiatrique Moussa Diop': ['/media/structures/moussa_diop_enseigne.webp', 'Enseigne de la clinique (photo fournie)'],
};

function type(t) {
  t = norm(t);
  if (t.includes('addicto')) return 'CENTRE_ADDICTOLOGIE';
  if (t.includes('ecole')) return 'ECOLE_INCLUSIVE';
  if (t.includes('association') || t.includes('communautaire')) return 'ASSOCIATION';
  if (t.includes('hopital') || t.includes('hospitalier')) return 'HOPITAL';
  return 'CENTRE_SPECIALISE';
}
function secteur(s) {
  s = norm(s);
  if (s.includes('prive')) return 'PRIVE';
  if (s.includes('associ') || s.includes('ong')) return 'ASSOCIATIF';
  if (s.includes('confes')) return 'CONFESSIONNEL';
  return 'PUBLIC';
}
function publics(p) {
  p = norm(p); const r = new Set();
  if (/enfant|adolescent/.test(p)) r.add('ENFANT');
  if (/adulte/.test(p)) r.add('ADULTE');
  if (/agee/.test(p)) r.add('PERSONNE_AGEE');
  if (!r.size) r.add('ENFANT');
  return [...r];
}
function ages(pub) {
  const min = pub.includes('ENFANT') ? 0 : 192;
  const max = pub.includes('PERSONNE_AGEE') || pub.includes('ADULTE') ? 1200 : 216;
  return [min, max];
}
const MOTS = [
  [/autis|tsa/, 'TSA'], [/tdah|attention/, 'TDAH'], [/deficience|intellect/, 'DI'], [/langage/, 'LANGAGE'],
  [/dys/, 'DYS'], [/moteur|psychomot|imc/, 'MOTEUR'], [/epilep/, 'EPILEPSIE'], [/depress/, 'DEPRESSION'],
  [/anxi|stress/, 'ANXIETE'], [/addict|drogue|alcool|toxico/, 'ADDICTION'], [/psychos|schizo|bipolaire|psychiatr|urgence/, 'PSYCHIATRIE_ADULTE'],
  [/demence|alzheimer|memoire/, 'DEMENCE'], [/trauma/, 'TRAUMA'], [/trisomie|down/, 'TRISOMIE'], [/neurodevelopp/, 'TSA'],
];
const troubles = (t) => { const n = norm(t); return [...new Set(MOTS.filter(([re]) => re.test(n)).map(([, c]) => c))]; };
const fiabilite = (f) => ({ elevee: 'ELEVEE', moyenne: 'MOYENNE', faible: 'FAIBLE' }[norm(f)] || null);
const premierTel = (t) => (t.match(/\+?\d[\d\s]{7,}\d/) || [null])[0];

async function importer(db) {
  const lignes = lireCsv(fs.readFileSync(CSV, 'utf8'));
  const existantes = (await db.query('SELECT id, nom, sigle, code, source FROM structures')).rows;
  const parNom = new Map();
  for (const s of existantes) {
    const cle = norm(ALIAS[norm(s.nom)] || s.nom);
    if (!parNom.has(cle)) parNom.set(cle, []);
    parNom.get(cle).push(s);
  }
  const codesPris = new Set(existantes.map((s) => s.code).filter(Boolean));
  const stats = { maj: 0, crees: 0, doublons: 0, desactives: 0 };
  const ids = {};

  // L'établissement de rattachement du pôle de Fann
  const fann = await db.query(
    `INSERT INTO structures (nom, sigle, code, type, secteur, region, commune, adresse, latitude, longitude, telephone,
        publics, troubles, statut_adhesion, fiabilite, source, verifie)
     VALUES ('Centre hospitalier national universitaire de Fann', 'CHNU de Fann', 'fann', 'HOPITAL', 'PUBLIC', 'Dakar', 'Fann',
        'Avenue Cheikh Anta Diop, Dakar', 14.6925, -17.4645, '+221 33 869 18 18',
        '{ENFANT,ADULTE,PERSONNE_AGEE}', '{TSA,TDAH,PSYCHIATRIE_ADULTE,ADDICTION,EPILEPSIE}', 'ANNUAIRE', 'ELEVEE',
        'Rapport santé mentale Sénégal 2019 (sante.gouv.sn)', true)
     ON CONFLICT (code) WHERE code IS NOT NULL DO UPDATE SET nom = EXCLUDED.nom RETURNING id`);
  const fannId = fann.rows[0].id;
  codesPris.add('fann');

  for (const l of lignes) {
    const nom = l['Nom officiel'];
    if (!nom) continue;
    const pub = publics(l['Public']);
    const [ageMin, ageMax] = ages(pub);
    const tr = troubles(l['Troubles pris en charge']);
    const logo = LOGOS[nom] || [null, null];
    const photo = PHOTOS[nom];
    const parent = norm(l['Établissement parent']).includes('fann') ? fannId : null;
    const candidats = parNom.get(norm(nom)) || [];
    const cible = candidats.find((c) => !/^osm:/i.test(c.source || '')) || candidats[0];
    for (const d of candidats.filter((c) => c !== cible)) {   // doublons (ex. Thiaroye seed + OSM)
      await db.query('UPDATE structures SET actif = false WHERE id = $1', [d.id]);
      stats.doublons++;
    }
    let code = cible?.code || CODES[nom] || slug(nom);
    if (!cible?.code) { let k = 2; const base = code.slice(0, 35); while (codesPris.has(code)) code = `${base}-${k++}`; codesPris.add(code); }
    const partenaire = norm(l['Statut plateforme']) === 'partenaire';
    const commun = {
      code, type: type(l['Type']), secteur: secteur(l['Secteur']), region: l['Région'] || 'Non précisée',
      commune: l['Ville / quartier'] || null, adresse: l['Adresse'] || null, telephone: premierTel(l['Téléphone']),
      horaires: l['Horaires'] || null, site_web: l['Site web'] || null, source: l['Source'] || null,
      publics: pub, fiabilite: fiabilite(l['Fiabilité']), parent_id: parent, logo_url: logo[0], couleur: logo[1],
      sigle: l['Sigle'] || null,
    };
    if (cible) {
      // Les fiches de démonstration gardent leur sigle, leurs troubles détaillés et leur statut de partenaire.
      const r = await db.query(
        `UPDATE structures SET code = $2, publics = $3, fiabilite = $4, parent_id = $5,
            logo_url = COALESCE($6, logo_url), couleur = COALESCE($7, couleur),
            telephone = COALESCE(telephone, $8), horaires = COALESCE(horaires, $9), site_web = COALESCE(site_web, $10),
            adresse = COALESCE(adresse, $11), source = COALESCE($12, source),
            troubles = CASE WHEN cardinality(troubles) = 0 THEN $13 ELSE troubles END,
            statut_adhesion = CASE WHEN partenaire OR $14 THEN 'PARTENAIRE' ELSE statut_adhesion END,
            partenaire = partenaire OR $14,
            photo_url = COALESCE($15, photo_url), photo_credit = COALESCE($16, photo_credit), actif = true,
            nom = CASE WHEN partenaire THEN nom ELSE $17 END
          WHERE id = $1 RETURNING id`,
        [cible.id, commun.code, pub, commun.fiabilite, parent, commun.logo_url, commun.couleur, commun.telephone,
          commun.horaires, commun.site_web, commun.adresse, commun.source, tr, partenaire, photo?.[0] || null, photo?.[1] || null, nom]);
      ids[nom] = r.rows[0].id; stats.maj++;
    } else {
      const r = await db.query(
        `INSERT INTO structures (nom, sigle, code, type, secteur, region, commune, adresse, telephone, horaires, site_web,
            source, publics, fiabilite, parent_id, logo_url, couleur, troubles, age_min_mois, age_max_mois,
            partenaire, statut_adhesion, photo_url, photo_credit, verifie)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id`,
        [nom, commun.sigle, code, commun.type, commun.secteur, commun.region, commun.commune, commun.adresse,
          commun.telephone, commun.horaires, commun.site_web, commun.source, pub, commun.fiabilite, parent,
          commun.logo_url, commun.couleur, tr, ageMin, ageMax, partenaire, partenaire ? 'PARTENAIRE' : 'ANNUAIRE',
          photo?.[0] || null, photo?.[1] || null, commun.fiabilite === 'ELEVEE']);
      ids[nom] = r.rows[0].id; stats.crees++;
    }
  }

  // Points OSM hors santé mentale : retirés de l'annuaire (pas supprimés)
  const d = await db.query(
    `UPDATE structures SET actif = false
      WHERE actif AND source ILIKE 'osm:%' AND fiabilite IS NULL AND NOT partenaire`);
  // Fiches de démonstration sans source officielle : gardées, mais signalées comme peu fiables
  await db.query(`UPDATE structures SET fiabilite = 'FAIBLE' WHERE actif AND fiabilite IS NULL AND code IS DISTINCT FROM 'fann'`);
  stats.desactives = d.rowCount;

  // Codes de portail pour les fiches restantes (hôpitaux OSM)
  const sansCode = (await db.query('SELECT id, nom FROM structures WHERE code IS NULL AND actif')).rows;
  for (const s of sansCode) {
    let code = slug(s.nom) || 'structure'; let k = 2; const base = code.slice(0, 35);
    while (codesPris.has(code)) code = `${base}-${k++}`;
    codesPris.add(code);
    await db.query('UPDATE structures SET code = $2 WHERE id = $1', [s.id, code]);
  }

  // Services internes des partenaires (exemples ; chaque établissement gère ensuite les siens)
  const SERVICES = {
    'Service de pédopsychiatrie Keur Xaleyi': [
      ['consultation', 'Consultation de pédopsychiatrie', 'pédopsychiatrie', ['ENFANT'], ['TSA', 'TDAH', 'DI']],
      ['orthophonie', 'Orthophonie', 'orthophonie', ['ENFANT'], ['LANGAGE', 'TSA']],
      ['psychomotricite', 'Psychomotricité', 'psychomotricité', ['ENFANT'], ['MOTEUR', 'TSA', 'TDAH']],
    ],
    'Clinique psychiatrique Moussa Diop': [
      ['urgences', 'Urgences psychiatriques', 'psychiatrie', ['ADULTE', 'PERSONNE_AGEE'], ['PSYCHIATRIE_ADULTE']],
      ['consultation', 'Consultation externe', 'psychiatrie', ['ADULTE', 'PERSONNE_AGEE'], ['DEPRESSION', 'ANXIETE', 'PSYCHIATRIE_ADULTE']],
      ['geronto', 'Psychogériatrie', 'psychogériatrie', ['PERSONNE_AGEE'], ['DEMENCE', 'DEPRESSION']],
    ],
    "Centre de prise en charge intégrée des addictions de Dakar": [
      ['consultation', 'Consultation d’addictologie', 'addictologie', ['ADULTE'], ['ADDICTION']],
      ['methadone', 'Traitement de substitution', 'addictologie', ['ADULTE'], ['ADDICTION']],
      ['psychologie', 'Soutien psychologique', 'psychologie', ['ADULTE'], ['DEPRESSION', 'ANXIETE']],
    ],
    'EducAutisme': [
      ['education', 'Éducation spécialisée', 'éducation spécialisée', ['ENFANT'], ['TSA', 'DI']],
      ['guidance', 'Guidance parentale', 'guidance parentale', ['ENFANT'], ['TSA']],
    ],
  };
  let nbServices = 0;
  for (const [nom, liste] of Object.entries(SERVICES)) {
    if (!ids[nom]) continue;
    for (const [code, libelle, spec, pub, tr] of liste) {
      await db.query(
        `INSERT INTO services (structure_id, code, nom, specialite, publics, troubles) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (structure_id, code) DO UPDATE SET nom = EXCLUDED.nom, specialite = EXCLUDED.specialite`,
        [ids[nom], code, libelle, spec, pub, tr]);
      nbServices++;
    }
  }
  // Abonnement « pilote » gratuit pour les partenaires
  await db.query(
    `INSERT INTO abonnements (structure_id, formule)
     SELECT id, 'PILOTE' FROM structures s WHERE statut_adhesion = 'PARTENAIRE'
       AND NOT EXISTS (SELECT 1 FROM abonnements a WHERE a.structure_id = s.id)`);
  return { ...stats, services: nbServices };
}

module.exports = { importer, lireCsv };

if (require.main === module) {
  const db = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD,
  });
  db.connect()
    .then(async () => { await db.query('BEGIN'); const s = await importer(db); await db.query('COMMIT'); return s; })
    .then((s) => { console.log(`[Annuaire] ${s.maj} mises à jour, ${s.crees} créées, ${s.doublons} doublon(s), ${s.desactives} point(s) OSM hors santé mentale retirés, ${s.services} services`); return db.end(); })
    .catch(async (e) => { console.error('[Annuaire] Échec :', e.message); await db.query('ROLLBACK').catch(() => {}); process.exit(1); });
}
