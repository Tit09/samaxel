'use strict';
const { emettre } = require('../services/temps-reel.service');
/**
 * Messagerie chiffrée de bout en bout (E2EE), cloisonnée par structure.
 * Le serveur ne voit JAMAIS le texte : il stocke ciphertext + nonce produits
 * par l'application (X25519 → HKDF → AES-256-GCM).
 */
const { pool, ctx, withContext } = require('../config/database');
const { notifier } = require('../services/notification.service');
const { notFound, badRequest, forbidden } = require('../utils/errors');

// ── GET /api/conversations ─────────────────────────────────────────────────
async function lister(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows } = await db.query(
      `SELECT c.*, st.nom AS structure_nom,
              p.prenom AS parent_prenom, p.nom AS parent_nom,
              pr.prenom AS pro_prenom, pr.nom AS pro_nom, pr.public_key AS pro_key, p.public_key AS parent_key,
              (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.lu_at IS NULL)::int AS non_lus
       FROM conversations c
       JOIN structures st ON st.id = c.structure_id
       JOIN users p ON p.id = c.parent_id
       JOIN users pr ON pr.id = c.professionnel_id
       ORDER BY c.dernier_message_at DESC NULLS LAST`, [req.user.id]);
    return rows.map((r) => {
      const moiParent = r.parent_id === req.user.id;
      return {
        id: r.id, structure_id: r.structure_id, structure_nom: r.structure_nom, enfant_id: r.enfant_id,
        interlocuteur: moiParent
          ? { id: r.professionnel_id, nom: `${r.pro_prenom} ${r.pro_nom}`, public_key: r.pro_key }
          : { id: r.parent_id, nom: `${r.parent_prenom} ${r.parent_nom}`, public_key: r.parent_key },
        non_lus: r.non_lus, dernier_message_at: r.dernier_message_at,
      };
    });
  });
  res.json({ conversations: data });
}

// ── POST /api/conversations ────────────────────────────────────────────────
// Parent → { professionnel_id, structure_id, enfant_id? }   Pro → { parent_id, enfant_id? }
async function ouvrir(req, res) {
  const b = req.body;
  const data = await ctx(req, async (db) => {
    let parentId; let proId; let structureId;
    if (req.user.role === 'PARENT') {
      parentId = req.user.id; proId = b.professionnel_id; structureId = b.structure_id;
      if (!proId || !structureId) throw badRequest('professionnel_id et structure_id obligatoires', 'MISSING_FIELDS');
      // Le professionnel doit être clinicien actif d'une structure qui suit un enfant du parent
      const { rowCount } = await db.query(
        `SELECT 1 FROM suivis s JOIN membres_structure m ON m.structure_id = s.structure_id
         WHERE s.parent_id = $1 AND s.structure_id = $2 AND s.statut IN ('DEMANDE','ACTIF')
           AND m.user_id = $3 AND m.statut = 'ACTIF' AND m.role IN ('MEDECIN','THERAPEUTE')`,
        [parentId, structureId, proId]);
      if (!rowCount) throw forbidden('Vous ne pouvez écrire qu’aux professionnels qui suivent votre enfant', 'NOT_ALLOWED');
    } else {
      parentId = b.parent_id; proId = req.user.id; structureId = req.user.structure_id;
      if (!parentId) throw badRequest('parent_id obligatoire', 'MISSING_FIELDS');
      const { rowCount } = await db.query(
        "SELECT 1 FROM suivis WHERE parent_id = $1 AND structure_id = $2 AND statut IN ('DEMANDE','ACTIF')",
        [parentId, structureId]);
      if (!rowCount) throw forbidden('Ce parent n’a pas de dossier dans votre structure', 'NOT_ALLOWED');
    }
    const { rows } = await db.query(
      `INSERT INTO conversations (parent_id, professionnel_id, structure_id, enfant_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (parent_id, professionnel_id, structure_id) DO UPDATE SET enfant_id = coalesce(conversations.enfant_id, EXCLUDED.enfant_id)
       RETURNING *`,
      [parentId, proId, structureId, b.enfant_id || null]);
    return rows[0];
  });
  res.status(201).json({ conversation: data });
}

// ── GET /api/conversations/:id/messages?avant=&limit= ─────────────────────
async function messages(req, res) {
  const { avant, limit } = req.validQuery;
  const data = await ctx(req, async (db) => {
    const { rowCount } = await db.query('SELECT 1 FROM conversations WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Conversation introuvable');
    const p = [req.params.id]; let filtre = '';
    if (avant) { p.push(avant); filtre = `AND created_at < $${p.length}`; }
    p.push(limit);
    const { rows } = await db.query(
      `SELECT id, sender_id, type, duree_s, ciphertext, nonce, lu_at, created_at FROM messages
       WHERE conversation_id = $1 ${filtre} ORDER BY created_at DESC LIMIT $${p.length}`, p);
    return rows.reverse();
  });
  res.json({ messages: data });
}

// ── POST /api/conversations/:id/messages  { ciphertext, nonce, type?, duree_s? } ──
// Texte ou message vocal : dans les deux cas le serveur ne reçoit que du chiffré.
async function envoyer(req, res) {
  const { type = 'TEXTE', duree_s: duree = null } = req.body;
  const data = await ctx(req, async (db) => {
    const { rows: [c] } = await db.query('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
    if (!c) throw notFound('Conversation introuvable');
    const { rows: [m] } = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, ciphertext, nonce, type, duree_s) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, sender_id, type, duree_s, ciphertext, nonce, created_at`,
      [c.id, req.user.id, req.body.ciphertext, req.body.nonce, type, type === 'AUDIO' ? duree : null]);
    await db.query('UPDATE conversations SET dernier_message_at = NOW() WHERE id = $1', [c.id]);
    const destinataire = c.parent_id === req.user.id ? c.professionnel_id : c.parent_id;
    await notifier(db, destinataire, {
      type: 'MESSAGE',
      titre: type === 'AUDIO' ? 'Nouveau message vocal' : 'Nouveau message',
      corps: type === 'AUDIO' ? 'Vous avez reçu un message vocal sécurisé.' : 'Vous avez reçu un nouveau message sécurisé.',
      data: { conversation_id: c.id },
    });
    // Temps réel : le destinataire recharge la conversation (le contenu, chiffré, n'est pas relayé ici)
    emettre(destinataire, 'message:nouveau', { conversation_id: c.id });
    return m;
  });
  res.status(201).json({ message: data });
}

// ── PUT /api/conversations/:id/lu ──────────────────────────────────────────
async function marquerLu(req, res) {
  const n = await ctx(req, async (db) => {
    const { rowCount } = await db.query(
      'UPDATE messages SET lu_at = NOW() WHERE conversation_id = $1 AND sender_id <> $2 AND lu_at IS NULL',
      [req.params.id, req.user.id]);
    return rowCount;
  });
  res.json({ marques_lus: n });
}

// ── PUT /api/users/me/public-key  { public_key } ───────────────────────────
async function publierCle(req, res) {
  await pool.query('UPDATE users SET public_key = $1 WHERE id = $2', [req.body.public_key, req.user.id]);
  res.json({ message: 'Clé publique enregistrée' });
}

// ── GET /api/users/:id/public-key  (seulement entre interlocuteurs) ────────
async function lireCle(req, res) {
  const cle = await ctx(req, async (db) => {
    const { rowCount } = await db.query(
      'SELECT 1 FROM conversations WHERE (parent_id = $1 AND professionnel_id = $2) OR (parent_id = $2 AND professionnel_id = $1)',
      [req.user.id, req.params.id]);
    if (!rowCount) throw forbidden('Aucune conversation avec cet utilisateur', 'NO_CONVERSATION');
    const { rows } = await db.query('SELECT public_key FROM users WHERE id = $1', [req.params.id]);
    return rows[0]?.public_key || null;
  });
  if (!cle) throw notFound('Cet utilisateur n’a pas encore activé la messagerie sécurisée', 'NO_PUBLIC_KEY');
  res.json({ public_key: cle });
}

// ── Sauvegarde chiffrée de la clé de messagerie (lecture sur tous les appareils) ──
// GET /api/users/me/cle-messagerie → { sauvegarde: { c, sel, nonce, iter, pk } | null }
async function lireSauvegarde(req, res) {
  const { rows } = await pool.query('SELECT cle_messagerie_sauvegarde FROM users WHERE id = $1', [req.user.id]);
  res.json({ sauvegarde: rows[0]?.cle_messagerie_sauvegarde || null });
}

// PUT /api/users/me/cle-messagerie  { c, sel, nonce, iter, pk }
// La clé privée arrive DÉJÀ chiffrée par l'appareil (clé tirée du mot de passe) : le serveur ne peut pas l'ouvrir.
async function ecrireSauvegarde(req, res) {
  const { c, sel, nonce, iter, pk } = req.body;
  await pool.query('UPDATE users SET cle_messagerie_sauvegarde = $1, public_key = $2 WHERE id = $3',
    [JSON.stringify({ v: 1, c, sel, nonce, iter, pk }), pk, req.user.id]);
  res.json({ message: 'Clé de messagerie sauvegardée' });
}

// ═══ Appels audio / vidéo entre un parent et son soignant ═════════════════
// L'invitation passe par le WebSocket de l'application (« appel:entrant ») ; le son et l'image
// passent ensuite d'un appareil à l'autre en WebRTC, chiffrés (DTLS-SRTP).
const SONNERIE_MS = 45000;
const minuteries = new Map();

function autreParticipant(c, moi) { return c.parent_id === moi ? c.professionnel_id : c.parent_id; }

// Toujours dans le contexte d'un participant : la RLS ne laisse voir l'appel qu'aux deux interlocuteurs
async function finirAppel(user, appelId, statut, notification = null) {
  clearTimeout(minuteries.get(appelId)); minuteries.delete(appelId);
  const a = await withContext(user, async (db) => {
    const { rows: [x] } = await db.query(
    `UPDATE appels SET statut = $2, fin_at = NOW() WHERE id = $1 AND statut IN ('SONNE', 'EN_COURS')
     RETURNING appels.*, (SELECT parent_id FROM conversations WHERE id = appels.conversation_id) AS parent_id,
               (SELECT professionnel_id FROM conversations WHERE id = appels.conversation_id) AS professionnel_id`,
    [appelId, statut]);
    if (x && notification) await notifier(db, autreParticipant(x, user.id), notification);
    return x;
  });
  if (!a) return null;
  for (const u of [a.parent_id, a.professionnel_id]) {
    if (u !== user.id) emettre(u, 'appel:fin', { appel_id: a.id, statut });
  }
  return a;
}

// POST /api/conversations/:id/appels  { mode: AUDIO | VIDEO }
async function lancerAppel(req, res) {
  const { mode } = req.body;
  const { appel, autre, nom } = await ctx(req, async (db) => {
    const { rows: [c] } = await db.query('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
    if (!c) throw notFound('Conversation introuvable');
    const { rows: [a] } = await db.query(
      'INSERT INTO appels (conversation_id, appelant_id, mode) VALUES ($1, $2, $3) RETURNING *', [c.id, req.user.id, mode]);
    const { rows: [u] } = await db.query('SELECT prenom, nom FROM users WHERE id = $1', [req.user.id]);
    return { appel: a, autre: autreParticipant(c, req.user.id), nom: `${u.prenom} ${u.nom}`.trim() };
  });
  emettre(autre, 'appel:entrant', { appel_id: appel.id, conversation_id: appel.conversation_id, mode, de: { id: req.user.id, nom } });
  // Sans réponse au bout de 45 s : appel manqué, l'autre est prévenu par notification
  const appelant = { ...req.user };
  minuteries.set(appel.id, setTimeout(() => {
    finirAppel(appelant, appel.id, 'MANQUE', {
      type: 'APPEL', titre: mode === 'VIDEO' ? 'Appel vidéo manqué' : 'Appel manqué',
      corps: `${nom} a essayé de vous appeler.`, data: { conversation_id: appel.conversation_id },
    }).catch((e) => console.error('[Appels]', e.message));
  }, SONNERIE_MS).unref());
  res.status(201).json({ appel });
}

// POST /api/appels/:id/repondre  { accepte }
async function repondreAppel(req, res) {
  const a = await ctx(req, async (db) => {
    const { rows: [x] } = await db.query('SELECT * FROM appels WHERE id = $1', [req.params.id]);
    if (!x) throw notFound('Appel introuvable');
    if (x.appelant_id === req.user.id) throw forbidden('Vous êtes l’appelant', 'NOT_ALLOWED');
    if (x.statut !== 'SONNE') throw badRequest('Cet appel est terminé', 'APPEL_TERMINE');
    return x;
  });
  if (!req.body.accepte) {
    await finirAppel(req.user, a.id, 'REFUSE');
    return res.json({ statut: 'REFUSE' });
  }
  clearTimeout(minuteries.get(a.id)); minuteries.delete(a.id);
  await ctx(req, (db) => db.query("UPDATE appels SET statut = 'EN_COURS', decroche_at = NOW() WHERE id = $1 AND statut = 'SONNE'", [a.id]));
  emettre(a.appelant_id, 'appel:accepte', { appel_id: a.id });
  res.json({ statut: 'EN_COURS' });
}

// POST /api/appels/:id/fin
async function terminerAppel(req, res) {
  const a = await ctx(req, async (db) => (await db.query('SELECT * FROM appels WHERE id = $1', [req.params.id])).rows[0]);
  if (!a) throw notFound('Appel introuvable');
  const fini = await finirAppel(req.user, a.id, a.statut === 'SONNE' ? 'MANQUE' : 'TERMINE');
  res.json({ statut: fini?.statut || a.statut });
}

module.exports = {
  lister, ouvrir, messages, envoyer, marquerLu, publierCle, lireCle,
  lireSauvegarde, ecrireSauvegarde, lancerAppel, repondreAppel, terminerAppel,
};
