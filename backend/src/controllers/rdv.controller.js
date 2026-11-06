'use strict';
const { ouvrirSuivi } = require('./suivis.controller');
const { ctx } = require('../config/database');
const { notifier } = require('../services/notification.service');
const { notifierStructure } = require('../services/membres.service');
const { chiffrer, dechiffrer } = require('../utils/crypto');
const { notFound, badRequest, forbidden } = require('../utils/errors');

const ANNULATION_MIN_HEURES = 12; // cahier des charges : annulation possible jusqu'à 12 h avant

function rdvPublic(r) {
  return {
    id: r.id, structure_id: r.structure_id, structure_nom: r.structure_nom, suivi_id: r.suivi_id,
    enfant_id: r.enfant_id, parent_id: r.parent_id, professionnel_id: r.professionnel_id,
    professionnel_nom: r.pro_prenom ? `${r.pro_prenom} ${r.pro_nom}` : null,
    type: r.type, motif: dechiffrer(r.motif_chiffre), date_souhaitee: r.date_souhaitee,
    date_confirmee: r.date_confirmee, duree_min: r.duree_min, statut: r.statut, priorite: r.priorite,
    consultation_id: r.consultation_id || null, created_at: r.created_at,
    enfant_prenom: r.enfant_prenom_chiffre ? dechiffrer(r.enfant_prenom_chiffre) : undefined,
    numero_dossier: r.numero_dossier || undefined,
  };
}

const SELECT = `SELECT r.*, st.nom AS structure_nom, u.prenom AS pro_prenom, u.nom AS pro_nom,
  (SELECT c.id FROM consultations c WHERE c.rdv_id = r.id LIMIT 1) AS consultation_id,
  e.prenom_chiffre AS enfant_prenom_chiffre, sv.numero_dossier
  FROM rendez_vous r JOIN structures st ON st.id = r.structure_id LEFT JOIN users u ON u.id = r.professionnel_id
  LEFT JOIN enfants e ON e.id = r.enfant_id LEFT JOIN suivis sv ON sv.id = r.suivi_id`;

// ── POST /api/rendez-vous ──────────────────────────────────────────────────
// Parent : demande. Professionnel : planifie directement (statut CONFIRME).
async function creer(req, res) {
  const b = req.body;
  const data = await ctx(req, async (db) => {
    const estParent = req.user.role === 'PARENT';
    const structureId = estParent ? b.structure_id : req.user.structure_id;
    if (!structureId) throw badRequest('structure_id obligatoire', 'MISSING_STRUCTURE');

    // La personne doit avoir un dossier (suivi) dans cet établissement. Pour une famille, la première
    // demande de rendez-vous OUVRE ce dossier automatiquement (plus d'étape « prise en charge » à part).
    let { rows: [suivi] } = await db.query(
      `SELECT * FROM suivis WHERE enfant_id = $1 AND structure_id = $2 AND statut IN ('DEMANDE', 'ACTIF')`,
      [b.enfant_id, structureId]);
    if (!suivi && estParent) {
      await ouvrirSuivi(db, req, { enfantId: b.enfant_id, structureId, motif: b.motif });
      ({ rows: [suivi] } = await db.query(
        `SELECT * FROM suivis WHERE enfant_id = $1 AND structure_id = $2 AND statut IN ('DEMANDE', 'ACTIF')`,
        [b.enfant_id, structureId]));
    }
    if (!suivi) throw badRequest('Cette personne n’a pas de dossier dans votre établissement', 'NO_SUIVI');
    if (estParent && suivi.parent_id !== req.user.id) throw forbidden();
    if (!estParent && b.type === 'TELECONSULTATION' && !b.professionnel_id && !['MEDECIN', 'THERAPEUTE'].includes(req.user.role)) {
      throw badRequest('Choisissez le médecin ou thérapeute qui mènera la téléconsultation', 'MISSING_PROFESSIONNEL');
    }
    if (b.professionnel_id) {
      const { rowCount } = await db.query(
        "SELECT 1 FROM membres_structure WHERE user_id = $1 AND structure_id = $2 AND statut = 'ACTIF'",
        [b.professionnel_id, structureId]);
      if (!rowCount) throw badRequest('Professionnel inconnu dans cette structure', 'INVALID_PROFESSIONNEL');
    }

    const { rows: [r] } = await db.query(
      `INSERT INTO rendez_vous (structure_id, suivi_id, enfant_id, parent_id, professionnel_id, type,
                                motif_chiffre, date_souhaitee, date_confirmee, duree_min, statut, priorite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [structureId, suivi.id, b.enfant_id, suivi.parent_id, b.professionnel_id || null, b.type,
        chiffrer(b.motif), b.date_souhaitee || null, estParent ? null : b.date_confirmee || b.date_souhaitee,
        b.duree_min || 30, estParent ? 'DEMANDE' : 'CONFIRME', suivi.priorite],
    );
    if (!estParent && r.type === 'TELECONSULTATION') await creerConsultation(db, r, r.professionnel_id || req.user.id);

    if (estParent) {
      await notifierStructure(db, structureId, ['SECRETAIRE', 'MEDECIN', 'ADMIN_STRUCTURE'], {
        type: 'DEMANDE_RDV', titre: 'Nouvelle demande de rendez-vous',
        corps: `Dossier ${suivi.numero_dossier} — ${r.type === 'TELECONSULTATION' ? 'téléconsultation' : 'présentiel'}`,
        data: { rdv_id: r.id },
      });
    } else {
      await notifier(db, suivi.parent_id, {
        type: 'RDV_CONFIRME', titre: 'Rendez-vous programmé',
        corps: `Rendez-vous le ${formatDate(r.date_confirmee)}`, data: { rdv_id: r.id },
      });
    }
    return r;
  });
  res.status(201).json({ rendez_vous: rdvPublic(data) });
}

// ── GET /api/rendez-vous?statut=&du=&au= ───────────────────────────────────
async function lister(req, res) {
  const q = req.validQuery;
  const data = await ctx(req, async (db) => {
    const cond = []; const p = [];
    if (q.statut) { p.push(q.statut); cond.push(`r.statut = $${p.length}`); }
    if (q.du) { p.push(q.du); cond.push(`coalesce(r.date_confirmee, r.date_souhaitee) >= $${p.length}`); }
    if (q.au) { p.push(q.au); cond.push(`coalesce(r.date_confirmee, r.date_souhaitee) <= $${p.length}`); }
    if (q.enfant_id) { p.push(q.enfant_id); cond.push(`r.enfant_id = $${p.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await db.query(
      `${SELECT} ${where}
       ORDER BY CASE r.statut WHEN 'DEMANDE' THEN 0 WHEN 'CONFIRME' THEN 1 ELSE 2 END,
                CASE r.priorite WHEN 'URGENT' THEN 0 WHEN 'PRIORITAIRE' THEN 1 ELSE 2 END,
                coalesce(r.date_confirmee, r.date_souhaitee) NULLS LAST`, p);
    return rows.map(rdvPublic);
  });
  res.json({ rendez_vous: data, total: data.length });
}

// ── PUT /api/rendez-vous/:id ───────────────────────────────────────────────
// Professionnel : CONFIRME (date, professionnel), TERMINE, ABSENT, ANNULE
// Parent : ANNULE uniquement, au plus tard 12 h avant
async function modifier(req, res) {
  const b = req.body;
  const data = await ctx(req, async (db) => {
    const { rows: [r] } = await db.query('SELECT * FROM rendez_vous WHERE id = $1', [req.params.id]);
    if (!r) throw notFound('Rendez-vous introuvable');

    if (req.user.role === 'PARENT') {
      if (b.statut !== 'ANNULE' || Object.keys(b).some((k) => !['statut', 'raison'].includes(k))) {
        throw forbidden('Vous pouvez seulement annuler un rendez-vous', 'PARENT_CANCEL_ONLY');
      }
      const quand = r.date_confirmee || r.date_souhaitee;
      if (r.statut === 'CONFIRME' && quand && new Date(quand) - Date.now() < ANNULATION_MIN_HEURES * 3600000) {
        throw badRequest(`Annulation impossible moins de ${ANNULATION_MIN_HEURES} h avant : appelez la structure`, 'TOO_LATE');
      }
    }
    if (['ANNULE', 'TERMINE', 'ABSENT'].includes(r.statut)) throw badRequest('Ce rendez-vous est déjà clôturé', 'RDV_CLOSED');
    if (b.statut === 'CONFIRME' && !(b.date_confirmee || r.date_souhaitee)) {
      throw badRequest('Indiquez la date du rendez-vous', 'MISSING_DATE');
    }

    const sets = []; const p = [];
    const set = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
    if (b.statut) set('statut', b.statut);
    if (b.date_confirmee) set('date_confirmee', b.date_confirmee);
    else if (b.statut === 'CONFIRME') set('date_confirmee', r.date_souhaitee);
    if (b.professionnel_id) set('professionnel_id', b.professionnel_id);
    if (b.duree_min) set('duree_min', b.duree_min);
    if (!sets.length) throw badRequest('Aucune modification', 'NO_FIELDS');
    p.push(r.id);
    const { rows: [maj] } = await db.query(`UPDATE rendez_vous SET ${sets.join(', ')} WHERE id = $${p.length} RETURNING *`, p);

    if (b.statut === 'CONFIRME' && maj.type === 'TELECONSULTATION') {
      if (!maj.professionnel_id && !['MEDECIN', 'THERAPEUTE'].includes(req.user.role)) {
        throw badRequest('Choisissez le médecin ou thérapeute qui mènera la téléconsultation', 'MISSING_PROFESSIONNEL');
      }
      await creerConsultation(db, maj, maj.professionnel_id || req.user.id);
    }
    if (b.statut === 'ANNULE') {
      await db.query("UPDATE consultations SET statut = 'ANNULEE' WHERE rdv_id = $1 AND statut = 'PLANIFIEE'", [r.id]);
    }

    // Notification de l'autre partie
    if (req.user.role === 'PARENT') {
      await notifierStructure(db, r.structure_id, ['SECRETAIRE', 'MEDECIN'], {
        type: 'RDV_ANNULE', titre: 'Rendez-vous annulé par le parent', corps: `Rendez-vous du ${formatDate(r.date_confirmee || r.date_souhaitee)}`,
        data: { rdv_id: r.id },
      });
    } else if (b.statut) {
      const textes = {
        CONFIRME: `Votre rendez-vous est confirmé le ${formatDate(maj.date_confirmee)}.`,
        ANNULE: 'Votre rendez-vous a été annulé par la structure. Elle vous recontactera.',
      };
      if (textes[b.statut]) {
        await notifier(db, r.parent_id, { type: `RDV_${b.statut}`, titre: 'Rendez-vous', corps: textes[b.statut], data: { rdv_id: r.id } });
      }
    }
    const { rows: [complet] } = await db.query(`${SELECT} WHERE r.id = $1`, [r.id]);
    return complet;
  });
  res.json({ rendez_vous: rdvPublic(data) });
}

/** Crée la consultation planifiée associée à une téléconsultation confirmée */
async function creerConsultation(db, rdv, professionnelId) {
  const { rowCount } = await db.query('SELECT 1 FROM consultations WHERE rdv_id = $1', [rdv.id]);
  if (rowCount) return;
  // Fonction SQL contrôlée (migration 003) : une secrétaire peut ainsi créer la
  // consultation vide sans jamais accéder au contenu médical.
  await db.query('SELECT creer_consultation_planifiee($1, $2)', [rdv.id, professionnelId]);
}

const formatDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'full', timeStyle: 'short' }) : 'date à confirmer');

module.exports = { creer, lister, modifier, rdvPublic, SELECT_RDV: SELECT };
