'use strict';
/**
 * Annuaire national des structures (public) + IA d'orientation.
 * Utilisé par le site vitrine (carte, inscription) et par l'application.
 */
const { pool, ctx } = require('../config/database');
const { recommander, distanceKm, SERVICES } = require('../ia/orientation');
const { ageEnMois } = require('../utils/format');
const { notFound, forbidden } = require('../utils/errors');

const CHAMPS_PUBLICS = `id, nom, sigle, type, secteur, description, region, departement, commune, adresse,
  latitude, longitude, telephone, email, site_web, troubles, services, age_min_mois, age_max_mois,
  langues, cout_niveau, delai_attente_jours, horaires, partenaire, verifie, photo_url, photo_credit, source,
  code, logo_url, couleur, statut_adhesion, publics, fiabilite, parent_id`;

// ── GET /api/structures ────────────────────────────────────────────────────
async function rechercher(req, res) {
  const q = req.validQuery;
  const cond = ['actif = true'];
  const p = [];
  const add = (sql, v) => { p.push(v); cond.push(sql.replace(/\$\?/g, `$${p.length}`)); };
  if (q.q) add('(nom ILIKE $? OR sigle ILIKE $? OR commune ILIKE $?)', `%${q.q}%`);
  if (q.region) add('region ILIKE $?', q.region);
  if (q.type) add('type = $?', q.type);
  if (q.secteur) add('secteur = $?', q.secteur);
  if (q.trouble) add('$? = ANY(troubles)', q.trouble);
  if (q.service) add('$? = ANY(services)', q.service);
  if (q.partenaire !== undefined) add('partenaire = $?', q.partenaire);
  if (q.public) add('$? = ANY(publics)', q.public);
  if (q.age_mois !== undefined) add('$? BETWEEN age_min_mois AND age_max_mois', q.age_mois);

  const { rows } = await pool.query(
    `SELECT ${CHAMPS_PUBLICS} FROM structures WHERE ${cond.join(' AND ')} ORDER BY partenaire DESC, region, nom`, p);

  let resultat = rows;
  if (q.lat !== undefined && q.lng !== undefined) {
    resultat = rows
      .map((s) => ({
        ...s,
        distance_km: s.latitude == null ? null
          : Math.round(distanceKm(q.lat, q.lng, Number(s.latitude), Number(s.longitude)) * 10) / 10,
      }))
      .filter((s) => q.rayon_km === undefined || (s.distance_km !== null && s.distance_km <= q.rayon_km))
      .sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  }
  const debut = (q.page - 1) * q.limit;
  res.json({ structures: resultat.slice(debut, debut + q.limit), total: resultat.length, page: q.page });
}

// ── GET /api/structures/:id ────────────────────────────────────────────────
async function detail(req, res) {
  const { rows } = await pool.query(`SELECT ${CHAMPS_PUBLICS} FROM structures WHERE id = $1 AND actif = true`, [req.params.id]);
  if (!rows[0]) throw notFound('Structure introuvable');
  res.json({ structure: rows[0] });
}

// ── GET /api/structures/:id/professionnels  (connecté) ─────────────────────
// Liste des professionnels actifs d'une structure partenaire (pour la messagerie / RDV)
async function professionnels(req, res) {
  const { rows } = await pool.query(
    `SELECT u.id, u.prenom, u.nom, m.role, m.specialite, u.langues_parlees, u.teleconsultation,
            (u.public_key IS NOT NULL) AS messagerie_active
     FROM membres_structure m JOIN users u ON u.id = m.user_id
     WHERE m.structure_id = $1 AND m.statut = 'ACTIF' AND m.role IN ('MEDECIN', 'THERAPEUTE') AND u.is_active
     ORDER BY m.role, u.nom`,
    [req.params.id],
  );
  res.json({ professionnels: rows });
}

// ── GET /api/structures/meta  — listes de valeurs pour les filtres ─────────
async function meta(_req, res) {
  const { rows } = await pool.query(
    "SELECT DISTINCT region FROM structures WHERE actif = true ORDER BY region");
  res.json({
    regions: rows.map((r) => r.region),
    types: ['HOPITAL', 'CENTRE_SANTE', 'CENTRE_SPECIALISE', 'ECOLE_INCLUSIVE', 'ECOLE_SPECIALISEE', 'CABINET', 'ASSOCIATION', 'CENTRE_ADDICTOLOGIE', 'CLINIQUE', 'EHPAD'],
    services: SERVICES,
    troubles: {
      TSA: 'Autisme (TSA)', TDAH: 'TDAH', DI: 'Déficience intellectuelle', LANGAGE: 'Langage et communication',
      DYS: 'Troubles des apprentissages (dys)', MOTEUR: 'Troubles moteurs', EPILEPSIE: 'Épilepsie',
      DEPRESSION: 'Dépression', ANXIETE: 'Anxiété', ADDICTION: 'Addictions', PSYCHIATRIE_ADULTE: 'Psychiatrie adulte',
      DEMENCE: 'Mémoire et démences', TRAUMA: 'Traumatismes', TRISOMIE: 'Trisomie 21',
    },
  });
}

// ── POST /api/orientation ──────────────────────────────────────────────────
// Public (site vitrine) ou connecté (avec enfant_id : déduit âge, langue, troubles)
async function orientation(req, res) {
  const b = req.body;
  const besoin = {
    troubles: b.troubles || [],
    services: b.services || [],
    ageMois: b.age_mois ?? null,
    lat: b.lat, lng: b.lng,
    region: b.region,
    budget: b.budget,
    langue: b.langue,
    ecole: b.ecole,
    diagnosticPose: b.diagnostic_pose,
  };

  if (b.enfant_id) {
    if (!req.user) throw forbidden('Connexion requise pour utiliser le profil d’un enfant');
    await ctx(req, async (db) => {
      const { rows: [e] } = await db.query(
        'SELECT mois_naissance, langue_maison, region FROM enfants WHERE id = $1', [b.enfant_id]);
      if (!e) throw notFound('Enfant introuvable');
      besoin.ageMois = besoin.ageMois ?? ageEnMois(e.mois_naissance);
      besoin.langue = besoin.langue || e.langue_maison;
      besoin.region = besoin.region || e.region;
      if (!besoin.troubles.length) {
        const { rows } = await db.query(
          `SELECT DISTINCT questionnaire_code FROM depistages
           WHERE enfant_id = $1 AND niveau <> 'FAIBLE' AND created_at > NOW() - INTERVAL '6 months'`,
          [b.enfant_id]);
        besoin.troubles = rows.map((r) => r.questionnaire_code);
      }
    });
  }

  const { rows } = await pool.query(`SELECT ${CHAMPS_PUBLICS}, actif FROM structures WHERE actif = true`);
  const recos = recommander(rows, besoin, b.limite || 8);
  res.json({
    besoin: { ...besoin, lat: undefined, lng: undefined },
    recommandations: recos.map((r) => ({ ...r, structure: { ...r.structure, actif: undefined } })),
    avertissement: 'Ces recommandations sont indicatives. Appelez la structure avant de vous déplacer.',
  });
}

module.exports = { rechercher, detail, professionnels, meta, orientation, CHAMPS_PUBLICS };
