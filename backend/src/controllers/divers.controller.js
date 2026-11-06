'use strict';
/**
 * Journal d'humeur (IA émotionnelle), notifications, profil utilisateur,
 * consentements, tableau de bord IA du professionnel.
 */
const { pool, ctx } = require('../config/database');
const { analyser } = require('../ia/emotion');
const { recalculerSuivis } = require('../services/triage.service');
const { notifierStructure } = require('../services/membres.service');
const { chiffrer, dechiffrer, dechiffrerJson } = require('../utils/crypto');
const { userPublic } = require('../utils/format');
const { notFound, badRequest } = require('../utils/errors');

// ═══ Journal d'humeur ═════════════════════════════════════════════════════

/** Le parent a-t-il accepté l'analyse par l'IA (dernier consentement) ? */
async function consentIA(db, parentId) {
  const { rows } = await db.query(
    "SELECT accepte FROM consentements WHERE parent_id = $1 AND type = 'IA_ANALYSE' ORDER BY created_at DESC LIMIT 1",
    [parentId]);
  return rows[0]?.accepte === true;
}

// ── POST /api/humeur  { humeur, texte?, enfant_id? } ──────────────────────
async function ajouterHumeur(req, res) {
  const { humeur, texte, enfant_id: enfantId } = req.body;
  const data = await ctx(req, async (db) => {
    if (enfantId) {
      const { rowCount } = await db.query('SELECT 1 FROM enfants WHERE id = $1 AND parent_id = $2', [enfantId, req.user.id]);
      if (!rowCount) throw notFound('Enfant introuvable');
    }
    const ia = await consentIA(db, req.user.id);
    const analyse = ia ? analyser(humeur, texte || '') : {};
    const { rows: [h] } = await db.query(
      `INSERT INTO humeur_journal (parent_id, enfant_id, humeur, texte_chiffre, analyse_ia)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, humeur, created_at`,
      [req.user.id, enfantId || null, humeur, chiffrer(texte), JSON.stringify(analyse)]);

    // Détresse forte : la priorité des dossiers de l'enfant est recalculée
    // et les cliniciens des structures qui le suivent sont prévenus.
    if (enfantId && ['ELEVE', 'CRISE'].includes(analyse.niveau)) {
      await recalculerSuivis(db, enfantId);
      if (analyse.niveau === 'CRISE') {
        const { rows: structures } = await db.query(
          "SELECT DISTINCT structure_id FROM suivis WHERE enfant_id = $1 AND statut IN ('DEMANDE','ACTIF')", [enfantId]);
        for (const s of structures) {
          await notifierStructure(db, s.structure_id, ['MEDECIN'], {
            type: 'ALERTE_DETRESSE', titre: 'Alerte : détresse d’un parent',
            corps: 'Un parent suivi par votre structure exprime une détresse grave. Consultez le dossier en priorité.',
            data: { enfant_id: enfantId },
          });
        }
      }
    }
    return { ...h, analyse_ia: ia ? analyse : null, ia_active: ia };
  });
  res.status(201).json({ entree: data });
}

// ── GET /api/humeur?enfant_id= ─────────────────────────────────────────────
async function listerHumeur(req, res) {
  const { enfant_id: enfantId } = req.validQuery;
  const data = await ctx(req, async (db) => {
    const p = []; let where = '';
    if (enfantId) { p.push(enfantId); where = 'WHERE enfant_id = $1'; }
    const { rows } = await db.query(`SELECT * FROM humeur_journal ${where} ORDER BY created_at DESC LIMIT 60`, p);
    return rows.map((r) => ({
      id: r.id, enfant_id: r.enfant_id, humeur: r.humeur, texte: dechiffrer(r.texte_chiffre),
      analyse_ia: r.analyse_ia, created_at: r.created_at,
    }));
  });
  res.json({ entrees: data });
}

// ═══ Notifications ════════════════════════════════════════════════════════

async function listerNotifications(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows } = await db.query(
      'SELECT id, type, titre, corps, data, lu, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]);
    return rows;
  });
  res.json({ notifications: data, non_lues: data.filter((n) => !n.lu).length });
}

async function lireNotification(req, res) {
  await ctx(req, (db) => db.query('UPDATE notifications SET lu = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]));
  res.json({ message: 'Notification lue' });
}

async function toutLire(req, res) {
  await ctx(req, (db) => db.query('UPDATE notifications SET lu = true WHERE user_id = $1 AND NOT lu', [req.user.id]));
  res.json({ message: 'Toutes les notifications sont lues' });
}

async function enregistrerAppareil(req, res) {
  await ctx(req, (db) => db.query(
    `INSERT INTO device_tokens (user_id, token, plateforme) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, plateforme = EXCLUDED.plateforme`,
    [req.user.id, req.body.token, req.body.plateforme]));
  res.status(201).json({ message: 'Appareil enregistré' });
}

// ═══ Profil et consentements ══════════════════════════════════════════════

async function monProfil(req, res) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const u = rows[0];
  res.json({
    user: {
      ...userPublic(u), role: req.user.role, structure_id: req.user.structure_id,
      profil_besoins: dechiffrerJson(u.profil_besoins_chiffre), capacite_paiement: u.capacite_paiement,
      langues_parlees: u.langues_parlees, teleconsultation: u.teleconsultation,
    },
  });
}

async function modifierProfil(req, res) {
  const b = req.body;
  const sets = []; const p = [];
  const set = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
  for (const col of ['nom', 'prenom', 'langue', 'region', 'photo_url', 'teleconsultation', 'langues_parlees', 'capacite_paiement']) {
    if (b[col] !== undefined) set(col, b[col]);
  }
  if (b.email !== undefined) set('email', b.email || null);
  if (!sets.length) throw badRequest('Aucune modification', 'NO_FIELDS');
  p.push(req.user.id);
  try {
    const { rows } = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${p.length} RETURNING *`, p);
    res.json({ user: userPublic(rows[0]) });
  } catch (err) {
    if (err.code === '23505') throw badRequest('Cet e-mail est déjà utilisé', 'EMAIL_TAKEN');
    throw err;
  }
}

/** Droit d'accès (loi 2008-12) : export de toutes les données du parent */
async function exporterMesDonnees(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: [u] } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const q = async (sql) => (await db.query(sql, [req.user.id])).rows;
    return {
      genere_le: new Date().toISOString(),
      utilisateur: { ...userPublic(u), profil_besoins: dechiffrerJson(u.profil_besoins_chiffre) },
      enfants: (await q('SELECT id, sexe, mois_naissance, region, langue_maison, created_at FROM enfants WHERE parent_id = $1')),
      consentements: await q('SELECT type, accepte, version, created_at FROM consentements WHERE parent_id = $1 ORDER BY created_at'),
      depistages: (await q('SELECT * FROM depistages WHERE parent_id = $1')).map((d) => ({
        questionnaire: d.questionnaire_code, score: d.score, niveau: d.niveau, reponses: dechiffrerJson(d.reponses_chiffre), date: d.created_at,
      })),
      rendez_vous: await q('SELECT type, statut, date_souhaitee, date_confirmee FROM rendez_vous WHERE parent_id = $1'),
      journal_humeur: (await q('SELECT * FROM humeur_journal WHERE parent_id = $1')).map((h) => ({
        humeur: h.humeur, texte: dechiffrer(h.texte_chiffre), date: h.created_at,
      })),
    };
  });
  res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees-sama-xhel.json"');
  res.json(data);
}

async function listerConsentements(req, res) {
  const data = await ctx(req, async (db) => (await db.query(
    'SELECT id, enfant_id, type, accepte, version, created_at FROM consentements WHERE parent_id = $1 ORDER BY created_at DESC',
    [req.user.id])).rows);
  res.json({ consentements: data });
}

async function donnerConsentement(req, res) {
  const { type, accepte, enfant_id: enfantId } = req.body;
  if (['CGU', 'DONNEES_SANTE'].includes(type) && !accepte) {
    throw badRequest('Le retrait de ce consentement nécessite la suppression du compte : contactez la structure ou le support', 'USE_ACCOUNT_DELETION');
  }
  const data = await ctx(req, async (db) => (await db.query(
    'INSERT INTO consentements (parent_id, enfant_id, type, accepte, ip) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [req.user.id, enfantId || null, type, accepte, req.ip])).rows[0]);
  res.status(201).json({ consentement: data });
}

// ═══ Tableau de bord IA du professionnel (structure active) ══════════════

async function tableauDeBord(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: file } = await db.query(
      `SELECT priorite, statut, count(*)::int AS n FROM suivis GROUP BY priorite, statut`);
    const { rows: alertes } = await db.query(
      `SELECT d.id, d.enfant_id, d.questionnaire_code, d.niveau, d.alertes, d.created_at, s.id AS suivi_id, s.numero_dossier
       FROM depistages d JOIN suivis s ON s.enfant_id = d.enfant_id AND s.structure_id = $1
       WHERE cardinality(d.alertes) > 0 AND d.created_at > NOW() - INTERVAL '30 days'
       ORDER BY d.created_at DESC LIMIT 20`, [req.user.structure_id]);
    const { rows: rdv } = await db.query(
      `SELECT statut, count(*)::int AS n FROM rendez_vous
       WHERE coalesce(date_confirmee, date_souhaitee, created_at) > NOW() - INTERVAL '30 days' GROUP BY statut`);
    const { rows: [att] } = await db.query(
      `SELECT round(avg(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400))::int AS jours
       FROM suivis WHERE statut = 'DEMANDE'`);
    let detresse = [];
    if (['MEDECIN', 'THERAPEUTE'].includes(req.user.role)) {
      const { rows } = await db.query(
        `SELECT h.enfant_id, h.analyse_ia->>'niveau' AS niveau, h.created_at, s.numero_dossier
         FROM humeur_journal h JOIN suivis s ON s.enfant_id = h.enfant_id AND s.structure_id = $1
         WHERE h.analyse_ia->>'niveau' IN ('ELEVE','CRISE') AND h.created_at > NOW() - INTERVAL '14 days'
         ORDER BY h.created_at DESC LIMIT 20`, [req.user.structure_id]);
      detresse = rows;
    }
    return { file, alertes, rendez_vous: rdv, attente_moyenne_jours: att?.jours ?? 0, detresse_parents: detresse };
  });
  res.json(data);
}

module.exports = {
  ajouterHumeur, listerHumeur, listerNotifications, lireNotification, toutLire, enregistrerAppareil,
  monProfil, modifierProfil, exporterMesDonnees, listerConsentements, donnerConsentement, tableauDeBord,
};
