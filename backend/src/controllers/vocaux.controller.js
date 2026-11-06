'use strict';
/**
 * Messages vocaux et assistant vocal — pour les parents qui ne lisent pas.
 *
 * Le parent parle (n'importe laquelle des 8 langues de l'application) :
 *   1. le vocal est chiffré et conservé (jamais supprimé) ;
 *   2. si le parent a accepté l'aide de l'IA, la voix est transcrite PAR NOTRE SERVEUR (ia-voix),
 *      l'assistant comprend la demande et répond par une phrase validée, dans sa langue,
 *      en ouvrant le bon écran (carte des centres, rendez-vous, test) ;
 *   3. le vocal est transmis aux cliniciens de la structure qui suit l'enfant ; ils répondent par un vocal.
 * Une détresse grave ou une urgence prévient immédiatement les médecins et affiche le SAMU (1515).
 */
const { ctx } = require('../config/database');
const env = require('../config/env');
const { comprendre, REPONSES } = require('../ia/intentions');
const { transcrire } = require('../services/iaVoix.service');
const { notifier } = require('../services/notification.service');
const { notifierStructure } = require('../services/membres.service');
const { recalculerSuivis } = require('../services/triage.service');
const { chiffrer, dechiffrer, chiffrerOctets, dechiffrerOctets } = require('../utils/crypto');
const { notFound, badRequest } = require('../utils/errors');

const TYPES_AUDIO = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/opus'];
const LANGUES = ['wo', 'ff', 'srr', 'dyo', 'mnk', 'bm', 'fr', 'en'];

function lireAudio(req) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!TYPES_AUDIO.includes(type)) throw badRequest('Format audio non accepté', 'INVALID_AUDIO');
  if (!Buffer.isBuffer(req.body) || req.body.length < 500) throw badRequest('Message vocal vide ou trop court', 'EMPTY_AUDIO');
  return { audio: req.body, type };
}

const publicVocal = (v) => ({
  id: v.id, sens: v.sens, langue: v.langue, enfant_id: v.enfant_id, structure_id: v.structure_id,
  duree_s: v.duree_s === null ? null : Number(v.duree_s), a_audio: v.a_audio ?? Boolean(v.audio_chiffre),
  transcription: dechiffrer(v.transcription_chiffree), confiance: v.confiance === null ? null : Number(v.confiance),
  intention: v.intention, mots_reconnus: v.mots_reconnus, niveau_emotion: v.niveau_emotion,
  reponse: v.reponse_cle ? { cle: v.reponse_cle, texte: v.reponse_texte, action: v.action } : null,
  auteur: v.auteur_nom || null, en_reponse_a: v.en_reponse_a, lu: Boolean(v.lu_at), created_at: v.created_at,
});

// ── POST /api/vocaux?langue=wo&enfant_id=  (corps = l'audio brut) ────────
async function envoyer(req, res) {
  const { audio, type } = lireAudio(req);
  const { enfant_id: enfantId, duree_s: duree } = req.validQuery;
  const langue = req.validQuery.langue || req.user.langue || 'fr';
  if (!LANGUES.includes(langue)) throw badRequest('Langue inconnue', 'INVALID_LANGUAGE');

  // 1. Contexte (consentement, structures qui suivent l'enfant) — transaction courte
  const contexte = await ctx(req, async (db) => {
    if (enfantId) {
      const { rowCount } = await db.query('SELECT 1 FROM enfants WHERE id = $1 AND parent_id = $2', [enfantId, req.user.id]);
      if (!rowCount) throw notFound('Enfant introuvable');
    }
    const { rows: [c] } = await db.query(
      "SELECT accepte FROM consentements WHERE parent_id = $1 AND type = 'IA_ANALYSE' ORDER BY created_at DESC LIMIT 1", [req.user.id]);
    const { rows: suivis } = await db.query(
      `SELECT DISTINCT structure_id, enfant_id FROM suivis
       WHERE parent_id = $1 AND statut IN ('DEMANDE','ACTIF') ${enfantId ? 'AND enfant_id = $2' : ''}`,
      enfantId ? [req.user.id, enfantId] : [req.user.id]);
    return { ia: c?.accepte === true, suivis };
  });

  // 2. Transcription par NOTRE IA vocale (hors transaction : quelques secondes)
  let trans = null;
  if (contexte.ia) trans = await transcrire(audio, type, langue);

  // 3. Compréhension + réponse validée
  const structures = [...new Set(contexte.suivis.map((s) => s.structure_id))];
  const enfantCible = enfantId || (new Set(contexte.suivis.map((s) => s.enfant_id)).size === 1 ? contexte.suivis[0].enfant_id : null);
  let analyse;
  if (!contexte.ia) {
    analyse = { intention: 'SANS_IA', mots: [], emotion: null, reponse: REPONSES.SANS_IA, transmettre: true };
  } else if (!trans?.texte) {
    analyse = structures.length
      ? { intention: 'NON_TRANSCRIT', mots: [], emotion: null, reponse: REPONSES.TRANSMIS, transmettre: true }
      : { intention: 'PAS_COMPRIS', mots: [], emotion: null, reponse: REPONSES.PAS_COMPRIS, transmettre: false };
  } else {
    analyse = comprendre(trans.texte, { confiance: trans.confiance, aUneEquipe: structures.length > 0 });
  }
  // Toujours transmettre quand il y a une équipe et que l'IA n'a pas pu traiter
  const transmettre = structures.length > 0 && analyse.transmettre;
  if (analyse.reponse === REPONSES.TRANSMIS && !transmettre) analyse.reponse = REPONSES.PAS_COMPRIS;

  const data = await ctx(req, async (db) => {
    const audioChiffre = chiffrerOctets(audio);
    const transChiffree = chiffrer(trans?.texte);
    const niveau = analyse.emotion?.niveau || null;
    const champs = 'parent_id, enfant_id, structure_id, sens, langue, audio_chiffre, audio_type, duree_s, transcription_chiffree, confiance, intention, mots_reconnus, niveau_emotion';
    const valeurs = (structureId) => [req.user.id, enfantCible, structureId, 'PARENT', langue, audioChiffre, type,
      duree ?? trans?.duree_s ?? null, transChiffree, trans?.confiance ?? null, analyse.intention, analyse.mots, niveau];
    const { rows: [msg] } = await db.query(
      `INSERT INTO vocaux (${champs}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, valeurs(null));
    if (transmettre) {
      for (const s of structures) {
        await db.query(`INSERT INTO vocaux (${champs}, en_reponse_a) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [...valeurs(s), msg.id]);
      }
    }
    const r = analyse.reponse;
    const { rows: [rep] } = await db.query(
      `INSERT INTO vocaux (parent_id, enfant_id, sens, langue, reponse_cle, reponse_texte, action, intention, en_reponse_a)
       VALUES ($1, $2, 'ASSISTANT', $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, enfantCible, langue, r.cle, r.fr, r.action ? JSON.stringify(r.action) : null, analyse.intention, msg.id]);

    // 4. Alerte des soignants
    const grave = ['URGENCE', 'CRISE'].includes(analyse.intention) || niveau === 'ELEVE';
    if (grave && enfantCible) await recalculerSuivis(db, enfantCible);
    if (transmettre) {
      for (const s of structures) {
        await notifierStructure(db, s, grave ? ['MEDECIN'] : ['MEDECIN', 'THERAPEUTE'], {
          type: grave ? 'ALERTE_VOCAL' : 'VOCAL_PARENT',
          titre: grave ? 'URGENT : message vocal d’un parent en détresse' : 'Nouveau message vocal d’un parent',
          corps: grave ? 'Écoutez-le en priorité et rappelez la famille.' : 'Un parent vous a laissé un message vocal.',
          data: { vocal_id: msg.id, enfant_id: enfantCible },
        });
      }
    }
    return { message: publicVocal(msg), reponse: publicVocal(rep), transmis_a: transmettre ? structures.length : 0 };
  });
  res.status(201).json({
    ...data,
    ia: contexte.ia ? (trans?.texte ? { modele: trans.modele, temps_s: trans.temps_s } : { indisponible: trans?.indisponible }) : { consentement: false },
  });
}

// ── GET /api/vocaux?enfant_id=&parent_id= ────────────────────────────────
// Parent : son fil (ses vocaux, l'assistant, les réponses des soignants). Clinicien : vocaux adressés à sa structure.
async function lister(req, res) {
  const { enfant_id: enfantId, parent_id: parentId } = req.validQuery;
  const data = await ctx(req, async (db) => {
    const p = []; const cond = [];
    if (req.user.role === 'PARENT') {
      cond.push("(v.structure_id IS NULL OR v.sens = 'SOIGNANT')");
    } else {
      cond.push('v.structure_id IS NOT NULL');
      if (parentId) { p.push(parentId); cond.push(`v.parent_id = $${p.length}`); }
    }
    if (enfantId) { p.push(enfantId); cond.push(`v.enfant_id = $${p.length}`); }
    const { rows } = await db.query(
      `SELECT v.id, v.sens, v.langue, v.enfant_id, v.structure_id, v.duree_s, (v.audio_chiffre IS NOT NULL) AS a_audio,
              v.transcription_chiffree, v.confiance, v.intention, v.mots_reconnus, v.niveau_emotion, v.reponse_cle,
              v.reponse_texte, v.action, v.en_reponse_a, v.lu_at, v.created_at, v.parent_id,
              u.prenom || ' ' || u.nom AS auteur_nom, pa.prenom || ' ' || pa.nom AS parent_nom
       FROM vocaux v LEFT JOIN users u ON u.id = v.auteur_id JOIN users pa ON pa.id = v.parent_id
       WHERE ${cond.join(' AND ')} ORDER BY v.created_at LIMIT 300`, p);
    return rows.map((v) => ({ ...publicVocal(v), parent_id: v.parent_id, parent_nom: v.parent_nom }));
  });
  res.json({ vocaux: data });
}

// ── GET /api/vocaux/:id/audio ─────────────────────────────────────────────
async function audio(req, res) {
  const v = await ctx(req, async (db) => {
    const { rows: [x] } = await db.query('SELECT id, sens, parent_id, audio_chiffre, audio_type FROM vocaux WHERE id = $1', [req.params.id]);
    if (!x || !x.audio_chiffre) throw notFound('Message vocal introuvable');
    // Accusé d'écoute : le destinataire (pas l'auteur) a écouté
    const destinataire = (x.sens === 'PARENT' && req.user.role !== 'PARENT') || (x.sens === 'SOIGNANT' && x.parent_id === req.user.id);
    if (destinataire) await db.query('UPDATE vocaux SET lu_at = NOW() WHERE id = $1 AND lu_at IS NULL', [x.id]);
    return x;
  });
  const octets = dechiffrerOctets(v.audio_chiffre);
  res.set({ 'Content-Type': v.audio_type, 'Cache-Control': 'no-store', 'Content-Length': octets.length });
  res.send(octets);
}

// ── POST /api/vocaux/:id/repondre  (clinicien, corps = audio) ────────────
async function repondre(req, res) {
  const { audio: octets, type } = lireAudio(req);
  const data = await ctx(req, async (db) => {
    const { rows: [orig] } = await db.query(
      "SELECT * FROM vocaux WHERE id = $1 AND sens = 'PARENT' AND structure_id IS NOT NULL", [req.params.id]);
    if (!orig) throw notFound('Message vocal introuvable');
    const { rows: [r] } = await db.query(
      `INSERT INTO vocaux (parent_id, enfant_id, structure_id, auteur_id, sens, langue, audio_chiffre, audio_type, duree_s, en_reponse_a)
       VALUES ($1, $2, $3, $4, 'SOIGNANT', $5, $6, $7, $8, $9) RETURNING *`,
      [orig.parent_id, orig.enfant_id, req.user.structure_id, req.user.id, orig.langue, chiffrerOctets(octets), type,
        req.validQuery.duree_s ?? null, orig.id]);
    await db.query('UPDATE vocaux SET lu_at = NOW() WHERE id = $1 AND lu_at IS NULL', [orig.id]);
    await notifier(db, orig.parent_id, {
      type: 'VOCAL_SOIGNANT', titre: 'Votre soignant vous a répondu', corps: 'Appuyez pour écouter son message vocal.',
      data: { vocal_id: r.id },
    });
    return publicVocal(r);
  });
  res.status(201).json({ vocal: data });
}

module.exports = { envoyer, lister, audio, repondre, LIMITE_AUDIO: env.isTest ? '2mb' : '6mb' };
