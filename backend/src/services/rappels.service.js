'use strict';
/**
 * RAPPELS AUTOMATIQUES — pour qu'aucun patient ne soit oublié.
 * Tourne toutes les 15 min dans le serveur ; un verrou Redis garantit qu'une seule instance
 * l'exécute (si l'API tourne sur plusieurs machines). Chaque rappel n'est envoyé qu'une fois
 * (table rappels_envoyes). Aucun contenu médical dans les SMS / e-mails.
 *
 *  Parents   : rendez-vous dans les 24 h (notification + SMS : le parent qui n'ouvre pas l'appli est prévenu)
 *  Médecins  : demande URGENTE sans réponse depuis 24 h ; toute demande en attente depuis 48 h ;
 *              vocal de parent non écouté depuis 24 h ; parent à rappeler (USSD) depuis 24 h.
 */
const { pool } = require('../config/database');
const redis = require('../config/redis');
const env = require('../config/env');
const { notifier } = require('./notification.service');
const { informer } = require('./contact.service');
const { evaluer: evaluerAcces } = require('../ia/anomalies');
const { predire: predireAbsence } = require('../ia/absence');
const { ancrer } = require('./securite/ancrage.service');
const alertes = require('./alertes.service');

const SEUIL_RISQUE = 50; // % : au-delà, rappel anticipé à 48 h sur tous les canaux

async function dejaEnvoye(db, cle) {
  const { rowCount } = await db.query('INSERT INTO rappels_envoyes (cle) VALUES ($1) ON CONFLICT DO NOTHING', [cle]);
  return rowCount === 0;
}

/** Destinataires cliniciens actifs d'une structure */
async function cliniciens(db, structureId, roles = ['MEDECIN']) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.telephone FROM membres_structure m JOIN users u ON u.id = m.user_id
     WHERE m.structure_id = $1 AND m.statut = 'ACTIF' AND m.role = ANY($2) AND u.is_active`, [structureId, roles]);
  return rows;
}

/** Une passe de rappels, hors contexte utilisateur : les fonctions rappel_*() (SECURITY DEFINER, migration 007)
 *  ne renvoient que des métadonnées (dates, statuts, nombres), jamais de contenu médical. */
async function executer(opts = {}) {
  const db = await pool.connect();
  const bilan = { rdv: 0, urgents: 0, attente: 0, vocaux: 0, rappels: 0, rdv_risque: 0, scores: 0, alertes: 0, ancrage: null };
  try {
    await db.query("SELECT set_config('app.role', 'SYSTEME', false)");
    // 1. Rendez-vous dans les 24 h → parent
    const { rows: rdv } = await db.query('SELECT * FROM rappel_rdv_24h()');
    for (const r of rdv) {
      if (await dejaEnvoye(db, `rdv24h:${r.id}`)) continue;
      const quand = new Date(r.date_confirmee).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', weekday: 'long', hour: '2-digit', minute: '2-digit' });
      const corps = `Rappel : rendez-vous ${r.type === 'TELECONSULTATION' ? 'vidéo' : ''} avec ${r.structure} ${quand}.`;
      await notifier(db, r.parent_id, { type: 'RAPPEL_RDV', titre: 'Rendez-vous demain', corps, data: { rdv_id: r.id } });
      await informer({ id: r.parent_id, telephone: r.telephone }, 'Rappel de rendez-vous', corps, { email: false, type: 'RAPPEL_RDV' });
      bilan.rdv++;
    }
    // 2. Demandes URGENTES sans réponse depuis 24 h → médecins (notification + e-mail + SMS)
    const { rows: urgents } = await db.query('SELECT * FROM rappel_urgents_24h()');
    for (const s of urgents) {
      if (await dejaEnvoye(db, `urgent24h:${s.id}:${new Date().toISOString().slice(0, 10)}`)) continue;
      for (const m of await cliniciens(db, s.structure_id)) {
        const corps = `Le dossier ${s.numero_dossier} est classé URGENT et attend une réponse depuis plus de 24 h.`;
        await notifier(db, m.id, { type: 'RELANCE_URGENT', titre: 'Patient urgent en attente', corps, data: { suivi_id: s.id } });
        await informer(m, 'Patient urgent en attente', corps, { tous: true, type: 'RELANCE_URGENT' });
      }
      bilan.urgents++;
    }
    // 3. Toute demande en attente depuis 48 h → médecins (notification)
    const { rows: attente } = await db.query('SELECT * FROM rappel_attente_48h()');
    for (const a of attente) {
      if (await dejaEnvoye(db, `attente48h:${a.structure_id}:${new Date().toISOString().slice(0, 10)}`)) continue;
      for (const m of await cliniciens(db, a.structure_id)) {
        await notifier(db, m.id, { type: 'RELANCE_ATTENTE', titre: `${a.n} demande(s) en attente`, corps: 'Des familles attendent une réponse depuis plus de 48 h.', data: {} });
      }
      bilan.attente++;
    }
    // 4. Vocaux de parents non écoutés depuis 24 h → cliniciens de la structure
    const { rows: vocaux } = await db.query('SELECT * FROM rappel_vocaux_24h()');
    for (const v of vocaux) {
      if (await dejaEnvoye(db, `vocaux24h:${v.structure_id}:${new Date().toISOString().slice(0, 10)}`)) continue;
      for (const m of await cliniciens(db, v.structure_id, ['MEDECIN', 'THERAPEUTE'])) {
        await notifier(db, m.id, { type: 'RELANCE_VOCAL', titre: `${v.n} message(s) vocal(aux) non écouté(s)`, corps: 'Des parents attendent votre réponse.', data: {} });
      }
      bilan.vocaux++;
    }
    // 5. Parents à rappeler (USSD) depuis 24 h → secrétariat
    const { rows: rappels } = await db.query('SELECT * FROM rappel_demandes_24h()');
    for (const r of rappels) {
      if (await dejaEnvoye(db, `rappel24h:${r.structure_id}:${new Date().toISOString().slice(0, 10)}`)) continue;
      for (const m of await cliniciens(db, r.structure_id, ['SECRETAIRE', 'ADMIN_STRUCTURE'])) {
        await notifier(db, m.id, { type: 'RELANCE_RAPPEL', titre: `${r.n} parent(s) à rappeler`, corps: 'Des parents sans smartphone attendent votre appel.', data: {} });
      }
      bilan.rappels++;
    }

    // 6. IA prédictive : risque d'absence de chaque rendez-vous confirmé à venir
    for (const r of (await db.query('SELECT * FROM ia_rdv_a_evaluer()')).rows) {
      const { risque, facteurs } = predireAbsence(r);
      await db.query('SELECT ia_rdv_noter($1, $2, $3)', [r.id, risque, JSON.stringify(facteurs)]);
      bilan.scores++;
    }
    //    … et rappel anticipé (48 h, tous les canaux) pour les familles à risque
    for (const r of (await db.query('SELECT * FROM rappel_rdv_48h_risque($1)', [SEUIL_RISQUE])).rows) {
      if (await dejaEnvoye(db, `rdv48h:${r.id}`)) continue;
      const quand = new Date(r.date_confirmee).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', weekday: 'long', hour: '2-digit', minute: '2-digit' });
      const corps = `Rappel : rendez-vous avec ${r.structure} ${quand}. Si vous ne pouvez pas venir, prévenez l'accueil pour libérer la place.`;
      await notifier(db, r.parent_id, { type: 'RAPPEL_RDV', titre: 'Rendez-vous dans 2 jours', corps, data: { rdv_id: r.id } });
      await informer({ id: r.parent_id, telephone: r.telephone }, 'Rappel de rendez-vous', corps, { email: false, tous: true, type: 'RAPPEL_RDV_RISQUE' });
      bilan.rdv_risque++;
    }

    // 7. IA de sécurité : accès anormaux de la dernière heure
    const heure = new Date().toISOString().slice(0, 13);
    for (const p of (await db.query('SELECT * FROM ia_profils_acces()')).rows) {
      for (const a of evaluerAcces(p)) {
        if (await dejaEnvoye(db, `alerte:${a.type}:${p.user_id}:${heure}`)) continue;
        // Enregistrement + diffusion immédiate (WebSocket, notification, Telegram d'astreinte)
        await alertes.lever({ type: a.type, userId: p.user_id, structureId: p.structure_id, score: a.score, details: a.details }, db);
        bilan.alertes++;
      }
    }

    // 7 bis. Intégrité du journal d'audit : une rupture de la chaîne SHA-256 = alerte immédiate
    await db.query("SELECT set_config('app.role', 'SUPER_ADMIN', false)");
    const { rows: [j] } = await db.query('SELECT * FROM audit_verifier()').catch(() => ({ rows: [] }));
    await db.query("SELECT set_config('app.role', 'SYSTEME', false)");
    if (j && j.valide === false && !(await dejaEnvoye(db, `journal-altere:${j.premiere_rupture}`))) {
      await alertes.lever({ type: 'JOURNAL_ALTERE', score: Number(j.premiere_rupture), details: { premiere_rupture: Number(j.premiere_rupture), entrees: Number(j.entrees) } }, db);
      bilan.alertes++;
    }

    // 8. Blockchain : ancrage quotidien du journal d'audit (OpenTimestamps → Bitcoin)
    if ((opts.ancrage ?? (!env.isTest && process.env.OTS_ACTIF !== 'false')) && !(await dejaEnvoye(db, `ancrage:${new Date().toISOString().slice(0, 10)}`))) {
      const a = await ancrer(db);
      bilan.ancrage = a.ancre ? `maillon ${a.dernier_audit}` : (a.raison || 'échec');
    }
  } finally {
    db.release();
  }
  return bilan;
}

let minuterie = null;
function demarrer() {
  if (env.isTest || minuterie) return;
  const tour = async () => {
    // Verrou : une seule instance de l'API envoie les rappels
    const verrou = await redis.set('verrou:rappels', String(process.pid), 'EX', 600, 'NX').catch(() => null);
    if (!verrou) return;
    try {
      const b = await executer();
      if (Object.values(b).some(Boolean)) console.log('[Rappels]', JSON.stringify(b));
    } catch (e) {
      console.error('[Rappels] erreur :', e.message);
    } finally {
      await redis.del('verrou:rappels').catch(() => {});
    }
  };
  setTimeout(tour, 30 * 1000);
  minuterie = setInterval(tour, 15 * 60 * 1000);
  minuterie.unref();
}

module.exports = { executer, demarrer };
