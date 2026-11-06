'use strict';
/**
 * Portails des établissements (multi-tenant).
 *
 *   GET  /portails                 → « Où êtes-vous suivi ? » : liste, recherche, près de moi
 *   GET  /portails/:code           → page de l'établissement : logo, couleur, services, boutons
 *   POST /portails/:code/inscription (parent)   → la famille rejoint l'établissement
 *   GET  /moi/etablissements      (parent)      → les tuiles « Mes établissements »
 *
 * Un établissement de l'annuaire (statut ANNUAIRE) a une page d'information
 * (adresse, téléphone, icône hôpital générique) mais pas encore d'inscription en ligne.
 */
const { pool, ctx } = require('../config/database');
const { ouvrirSuivi } = require('./suivis.controller');
const { notifier } = require('../services/notification.service');
const { distanceKm } = require('../ia/orientation');
const { notFound, badRequest, conflict } = require('../utils/errors');
const { dechiffrer } = require('../utils/crypto');

const EN_LIGNE = "statut_adhesion = 'PARTENAIRE'";
const CHAMPS = `s.id, s.code, s.nom, s.sigle, s.type, s.secteur, s.region, s.commune, s.adresse, s.telephone,
  s.horaires, s.site_web, s.latitude, s.longitude, s.troubles, s.publics, s.logo_url, s.couleur,
  s.photo_url, s.photo_credit, s.fiabilite, s.statut_adhesion, (s.${EN_LIGNE}) AS en_ligne,
  p.code AS parent_code, COALESCE(p.sigle, p.nom) AS parent_nom`;

/** Forme commune renvoyée à l'application : sans logo → icône hôpital générique côté client */
function presenter(s) {
  return {
    ...s,
    latitude: s.latitude == null ? null : Number(s.latitude),
    longitude: s.longitude == null ? null : Number(s.longitude),
    logo_url: s.en_ligne ? s.logo_url : null,
    icone: s.en_ligne && s.logo_url ? 'LOGO' : 'HOPITAL_GENERIQUE',
    parent: s.parent_code ? { code: s.parent_code, nom: s.parent_nom } : null,
    parent_code: undefined,
    parent_nom: undefined,
  };
}

// ── GET /api/portails ──────────────────────────────────────────────────────
async function lister(req, res) {
  const q = req.validQuery;
  const cond = ['s.actif = true', 's.code IS NOT NULL'];
  const p = [];
  const add = (sql, v) => { p.push(v); cond.push(sql.replace(/\$\?/g, `$${p.length}`)); };
  if (q.q) add('(s.nom ILIKE $? OR s.sigle ILIKE $? OR s.code ILIKE $? OR s.commune ILIKE $? OR p.nom ILIKE $? OR p.sigle ILIKE $?)', `%${q.q}%`);
  if (q.region) add('s.region ILIKE $?', q.region);
  if (q.public) add('$? = ANY(s.publics)', q.public);
  if (q.trouble) add('$? = ANY(s.troubles)', q.trouble);
  if (q.en_ligne !== undefined) cond.push(q.en_ligne ? `s.${EN_LIGNE}` : `NOT s.${EN_LIGNE}`);
  if (q.parent) add('p.code = $?', q.parent);

  const { rows } = await pool.query(
    `SELECT ${CHAMPS} FROM structures s LEFT JOIN structures p ON p.id = s.parent_id
      WHERE ${cond.join(' AND ')}
      ORDER BY (s.${EN_LIGNE}) DESC, s.region, s.nom`, p);

  let liste = rows.map(presenter);
  if (q.lat !== undefined && q.lng !== undefined) {
    liste = liste
      .map((s) => ({ ...s, distance_km: s.latitude == null ? null
        : Math.round(distanceKm(q.lat, q.lng, s.latitude, s.longitude) * 10) / 10 }))
      .sort((a, b) => (b.en_ligne - a.en_ligne) || ((a.distance_km ?? 1e9) - (b.distance_km ?? 1e9)));
  }
  const debut = (q.page - 1) * q.limit;
  res.json({ etablissements: liste.slice(debut, debut + q.limit), total: liste.length, page: q.page });
}

// ── GET /api/portails/:code ────────────────────────────────────────────────
async function portail(req, res) {
  const { rows } = await pool.query(
    `SELECT ${CHAMPS}, s.description FROM structures s LEFT JOIN structures p ON p.id = s.parent_id
      WHERE s.code = $1 AND s.actif = true`, [req.params.code]);
  if (!rows[0]) throw notFound('Établissement introuvable', 'PORTAIL_INCONNU');
  const e = presenter(rows[0]);

  const [services, rattaches] = await Promise.all([
    pool.query(
      `SELECT code, nom, specialite, publics, troubles, telephone, horaires
         FROM services WHERE structure_id = $1 AND actif ORDER BY nom`, [e.id]),
    pool.query(
      `SELECT ${CHAMPS} FROM structures s LEFT JOIN structures p ON p.id = s.parent_id
        WHERE s.parent_id = $1 AND s.actif ORDER BY (s.${EN_LIGNE}) DESC, s.nom`, [e.id]),
  ]);

  res.json({
    etablissement: e,
    services: services.rows,
    rattaches: rattaches.rows.map(presenter),   // ex. le CHNU de Fann → Keur Xaleyi, Moussa Diop, CEPIAD…
    actions: {
      inscription_famille: e.en_ligne,
      connexion_famille: e.en_ligne,
      connexion_personnel: e.en_ligne,
      appeler: Boolean(e.telephone),
      demander_adhesion: !e.en_ligne,          // « Vous travaillez ici ? Inscrivez votre établissement »
    },
  });
}

// ── POST /api/portails/:code/inscription  [PARENT] ──────────────────────────
async function inscrire(req, res) {
  const { personne_id, service_code, origine } = req.body;
  const { rows: [e] } = await pool.query(
    `SELECT id, nom, statut_adhesion FROM structures WHERE code = $1 AND actif`, [req.params.code]);
  if (!e) throw notFound('Établissement introuvable', 'PORTAIL_INCONNU');
  if (e.statut_adhesion !== 'PARTENAIRE') {
    throw badRequest('Cet établissement n’est pas encore sur SAMA XHEL : appelez-le directement.', 'PAS_ENCORE_EN_LIGNE');
  }

  const inscription = await ctx(req, async (c) => {
    let serviceId = null;
    if (service_code) {
      const s = await c.query('SELECT id FROM services WHERE structure_id = $1 AND code = $2 AND actif', [e.id, service_code]);
      if (!s.rows[0]) throw notFound('Service introuvable dans cet établissement', 'SERVICE_INCONNU');
      serviceId = s.rows[0].id;
    }
    if (personne_id) {
      // La RLS ne renvoie la fiche que si elle appartient au parent connecté
      const p = await c.query('SELECT id FROM enfants WHERE id = $1 AND parent_id = $2', [personne_id, req.user.id]);
      if (!p.rows[0]) throw notFound('Personne suivie introuvable', 'PERSONNE_INCONNUE');
    }
    // Personne choisie → son dossier est ouvert tout de suite (visible par l'équipe de l'établissement)
    if (personne_id) await ouvrirSuivi(c, req, { enfantId: personne_id, structureId: e.id, motif: req.body.motif });
    const deja = await c.query('SELECT id, statut FROM inscriptions WHERE parent_id = $1 AND structure_id = $2', [req.user.id, e.id]);
    if (deja.rows[0] && ['DEMANDEE', 'ACTIVE'].includes(deja.rows[0].statut)) {
      if (personne_id) return { id: deja.rows[0].id, statut: deja.rows[0].statut };
      throw conflict('Vous êtes déjà inscrit dans cet établissement', 'DEJA_INSCRIT');
    }
    if (deja.rows[0]) {
      const r = await c.query(
        `UPDATE inscriptions SET statut = 'DEMANDEE', service_id = $2, personne_id = $3, origine = $4
          WHERE id = $1 RETURNING id, statut, created_at`, [deja.rows[0].id, serviceId, personne_id || null, origine]);
      return r.rows[0];
    }
    const r = await c.query(
      `INSERT INTO inscriptions (parent_id, structure_id, service_id, personne_id, origine)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, statut, created_at`,
      [req.user.id, e.id, serviceId, personne_id || null, origine]);
    return r.rows[0];
  });
  res.status(201).json({
    inscription,
    message: `Votre demande a été envoyée à ${e.nom}. L’accueil vous confirmera par SMS ou dans l’application.`,
  });
}

// ── GET /api/moi/etablissements  [PARENT] ──────────────────────────────────
async function mesEtablissements(req, res) {
  const rows = await ctx(req, async (c) => (await c.query(
    `SELECT i.id AS inscription_id, i.statut, i.created_at, sv.nom AS service,
            ${CHAMPS}
       FROM inscriptions i
       JOIN structures s ON s.id = i.structure_id
       LEFT JOIN structures p ON p.id = s.parent_id
       LEFT JOIN services sv ON sv.id = i.service_id
      WHERE i.parent_id = $1 AND i.statut IN ('DEMANDEE', 'ACTIVE')
      ORDER BY i.created_at`, [req.user.id])).rows);
  res.json({
    etablissements: rows.map((r) => ({
      inscription: { id: r.inscription_id, statut: r.statut, service: r.service, depuis: r.created_at },
      ...presenter({ ...r, inscription_id: undefined, statut: undefined, service: undefined, created_at: undefined }),
    })),
  });
}

// ── PUT /api/inscriptions/:id  [PRO de l'établissement] : accepter / refuser ─
async function traiterInscription(req, res) {
  const { statut, referent_id } = req.body;
  const r = await ctx(req, async (c) => {
    const ins = (await c.query(
      `UPDATE inscriptions SET statut = $2, traite_par = $3
        WHERE id = $1 AND structure_id = $4 RETURNING id, parent_id, statut`,
      [req.params.id, statut, req.user.id, req.user.structure_id])).rows[0];
    if (!ins) return null;
    // Accepter la famille = accepter les dossiers qu'elle a ouverts ici (un seul geste pour l'accueil)
    if (statut === 'ACTIVE' || statut === 'REFUSEE') {
      await c.query(
        "UPDATE suivis SET statut = $3 WHERE parent_id = $1 AND structure_id = $2 AND statut = 'DEMANDE'",
        [ins.parent_id, req.user.structure_id, statut === 'ACTIVE' ? 'ACTIF' : 'REFUSE']);
    }
    // Le dossier accepté reçoit un SOIGNANT RÉFÉRENT : celui choisi par l'accueil, sinon le
    // médecin / thérapeute de l'établissement qui suit le moins de dossiers. La famille le voit
    // tout de suite dans la « maison » de l'hôpital (rendez-vous, message, visio).
    if (statut === 'ACTIVE') {
      let ref = referent_id;
      if (ref) {
        const { rowCount } = await c.query(
          "SELECT 1 FROM membres_structure WHERE user_id = $1 AND structure_id = $2 AND statut = 'ACTIF' AND role IN ('MEDECIN','THERAPEUTE')",
          [ref, req.user.structure_id]);
        if (!rowCount) throw badRequest('Ce soignant n’appartient pas à votre établissement', 'INVALID_PROFESSIONNEL');
      } else {
        ref = (await c.query(
          `SELECT m.user_id FROM membres_structure m
            WHERE m.structure_id = $1 AND m.statut = 'ACTIF' AND m.role IN ('MEDECIN','THERAPEUTE')
            ORDER BY (SELECT count(*) FROM suivis s WHERE s.referent_id = m.user_id AND s.statut = 'ACTIF'), (m.role = 'THERAPEUTE')
            LIMIT 1`, [req.user.structure_id])).rows[0]?.user_id;
      }
      if (ref) {
        await c.query(
          "UPDATE suivis SET referent_id = $3 WHERE parent_id = $1 AND structure_id = $2 AND statut = 'ACTIF' AND referent_id IS NULL",
          [ins.parent_id, req.user.structure_id, ref]);
      }
    }
    await notifier(c, ins.parent_id, {
      type: 'INSCRIPTION_' + statut,
      titre: statut === 'ACTIVE' ? 'Vous avez été accepté' : 'Demande non retenue',
      corps: statut === 'ACTIVE'
        ? 'L’établissement a accepté votre demande. Votre soignant est indiqué dans l’établissement : prenez rendez-vous ou écrivez-lui.'
        : 'L’établissement n’a pas pu accepter votre demande. Consultez l’application pour d’autres établissements.',
      data: {},
    });
    return ins;
  });
  if (!r) throw notFound('Inscription introuvable');
  res.json({ inscription: r });
}

// ── GET /api/inscriptions  [PRO] : file des familles qui rejoignent l'établissement ─
async function listerInscriptions(req, res) {
  const statut = req.validQuery.statut;
  const rows = await ctx(req, async (c) => (await c.query(
    `SELECT i.id, i.statut, i.origine, i.created_at, u.prenom, u.nom, u.langue, sv.nom AS service
       FROM inscriptions i
       JOIN users u ON u.id = i.parent_id
       LEFT JOIN services sv ON sv.id = i.service_id
      WHERE i.structure_id = $1 AND ($2::text IS NULL OR i.statut = $2)
      ORDER BY i.created_at DESC LIMIT 200`, [req.user.structure_id, statut || null])).rows);
  res.json({ inscriptions: rows });
}

// ── GET /api/moi/etablissements/:code  [PARENT] : « la maison » de l'hôpital ─
// Tout ce que la famille a DANS cet établissement, et seulement là : son inscription,
// ses dossiers et le soignant référent, les soignants qu'elle peut consulter (une fois
// acceptée), ses rendez-vous, ses tickets et les tarifs de la caisse.
async function maison(req, res) {
  const { rows } = await pool.query(
    `SELECT ${CHAMPS}, s.description FROM structures s LEFT JOIN structures p ON p.id = s.parent_id
      WHERE s.code = $1 AND s.actif = true`, [req.params.code]);
  if (!rows[0]) throw notFound('Établissement introuvable', 'PORTAIL_INCONNU');
  const e = presenter(rows[0]);
  const { SELECT_RDV, rdvPublic } = require('./rdv.controller');
  const data = await ctx(req, async (c) => {
    const ins = (await c.query(
      `SELECT i.id, i.statut, i.created_at, sv.nom AS service FROM inscriptions i
         LEFT JOIN services sv ON sv.id = i.service_id WHERE i.parent_id = $1 AND i.structure_id = $2`,
      [req.user.id, e.id])).rows[0] || null;
    const dossiers = (await c.query(
      `SELECT s.id, s.numero_dossier, s.statut, s.priorite, s.enfant_id, s.referent_id, s.created_at,
              e.prenom_chiffre, e.sexe, e.mois_naissance, u.prenom AS ref_prenom, u.nom AS ref_nom,
              m.role AS ref_role, m.specialite AS ref_specialite
         FROM suivis s JOIN enfants e ON e.id = s.enfant_id
         LEFT JOIN users u ON u.id = s.referent_id
         LEFT JOIN membres_structure m ON m.user_id = s.referent_id AND m.structure_id = s.structure_id
        WHERE s.parent_id = $1 AND s.structure_id = $2 AND s.statut IN ('DEMANDE','ACTIF')
        ORDER BY s.created_at`, [req.user.id, e.id])).rows;
    const soignants = ins?.statut === 'ACTIVE'
      ? (await c.query('SELECT * FROM soignants_pour_famille($1)', [e.id])).rows : [];
    const rdv = (await c.query(
      `${SELECT_RDV} WHERE r.parent_id = $1 AND r.structure_id = $2 AND r.statut IN ('DEMANDE','CONFIRME')
        ORDER BY COALESCE(r.date_confirmee, r.date_souhaitee, r.created_at) LIMIT 10`, [req.user.id, e.id])).rows;
    const tickets = (await c.query(
      `SELECT t.id, t.numero, t.statut, t.montant, t.mode_paiement, t.orientation, t.bureau, t.jour, ta.libelle AS tarif
         FROM tickets t JOIN tarifs ta ON ta.id = t.tarif_id
        WHERE t.parent_id = $1 AND t.structure_id = $2 ORDER BY t.created_at DESC LIMIT 5`, [req.user.id, e.id])).rows;
    const tarifs = (await c.query(
      'SELECT id, code, libelle, montant, orientation, en_ligne FROM tarifs WHERE structure_id = $1 AND actif ORDER BY montant', [e.id])).rows;
    return { ins, dossiers, soignants, rdv, tickets, tarifs };
  });
  const services = (await pool.query(
    'SELECT code, nom, specialite FROM services WHERE structure_id = $1 AND actif ORDER BY nom', [e.id])).rows;
  res.json({
    etablissement: e,
    services,
    inscription: data.ins,
    dossiers: data.dossiers.map((d) => ({
      id: d.id, numero_dossier: d.numero_dossier, statut: d.statut, priorite: d.priorite, personne_id: d.enfant_id,
      personne: dechiffrer(d.prenom_chiffre), cree_le: d.created_at,
      referent: d.referent_id ? { id: d.referent_id, nom: `${d.ref_prenom} ${d.ref_nom}`, role: d.ref_role, specialite: d.ref_specialite } : null,
    })),
    soignants: data.soignants.map((p) => ({ id: p.id, nom: `${p.prenom} ${p.nom}`, role: p.role, specialite: p.specialite })),
    rendez_vous: data.rdv.map(rdvPublic),
    tickets: data.tickets,
    tarifs: data.tarifs,
  });
}

// ── GET /api/etablissement/soignants  [PRO] : pour choisir le référent d'une famille ─
async function soignantsEtablissement(req, res) {
  const rows = await ctx(req, async (c) => (await c.query(
    `SELECT u.id, u.prenom, u.nom, m.role, m.specialite,
            (SELECT count(*)::int FROM suivis s WHERE s.referent_id = u.id AND s.structure_id = m.structure_id AND s.statut = 'ACTIF') AS dossiers
       FROM membres_structure m JOIN users u ON u.id = m.user_id
      WHERE m.structure_id = $1 AND m.statut = 'ACTIF' AND m.role IN ('MEDECIN','THERAPEUTE') ORDER BY u.nom`,
    [req.user.structure_id])).rows);
  res.json({ soignants: rows.map((p) => ({ id: p.id, nom: `${p.prenom} ${p.nom}`, role: p.role, specialite: p.specialite, dossiers: p.dossiers })) });
}

module.exports = { lister, portail, inscrire, mesEtablissements, traiterInscription, listerInscriptions, presenter, maison, soignantsEtablissement };
