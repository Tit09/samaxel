'use strict';
const { emettre } = require('../services/temps-reel.service');
/**
 * Messagerie chiffrée de bout en bout (E2EE), cloisonnée par structure.
 * Le serveur ne voit JAMAIS le texte : il stocke ciphertext + nonce produits
 * par l'application (X25519 → HKDF → AES-256-GCM).
 */
const { pool, ctx } = require('../config/database');
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
      `SELECT id, sender_id, ciphertext, nonce, lu_at, created_at FROM messages
       WHERE conversation_id = $1 ${filtre} ORDER BY created_at DESC LIMIT $${p.length}`, p);
    return rows.reverse();
  });
  res.json({ messages: data });
}

// ── POST /api/conversations/:id/messages  { ciphertext, nonce } ───────────
async function envoyer(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: [c] } = await db.query('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
    if (!c) throw notFound('Conversation introuvable');
    const { rows: [m] } = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, ciphertext, nonce) VALUES ($1, $2, $3, $4)
       RETURNING id, sender_id, ciphertext, nonce, created_at`,
      [c.id, req.user.id, req.body.ciphertext, req.body.nonce]);
    await db.query('UPDATE conversations SET dernier_message_at = NOW() WHERE id = $1', [c.id]);
    const destinataire = c.parent_id === req.user.id ? c.professionnel_id : c.parent_id;
    await notifier(db, destinataire, {
      type: 'MESSAGE', titre: 'Nouveau message', corps: 'Vous avez reçu un nouveau message sécurisé.',
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

module.exports = { lister, ouvrir, messages, envoyer, marquerLu, publierCle, lireCle };
