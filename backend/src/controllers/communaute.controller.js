'use strict';
/**
 * GROUPE DES PARENTS « TND Sénégal » — entraide et prise en main de l'application.
 * Modéré par l'équipe SAMA XHEL (super-administrateur). Règles affichées à l'entrée :
 *   - jamais de nom complet, de numéro de téléphone ni de détail médical ;
 *   - un message signalé est masqué (jamais effacé : traçabilité).
 * Pseudo = prénom + région. Un filtre retire automatiquement numéros de téléphone et e-mails.
 */
const { ctx } = require('../config/database');
const env = require('../config/env');
const { notFound } = require('../utils/errors');

const FILTRES = [
  [/(\+?221)?[\s.-]?(7[05678]|33|30)[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/g, '[numéro masqué]'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail masqué]'],
];
const proteger = (t) => FILTRES.reduce((acc, [re, rempl]) => acc.replace(re, rempl), String(t));

async function lister(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows } = await db.query(
      `SELECT id, pseudo, texte, masque, auteur_id = app_uid() AS de_moi, created_at
       FROM communaute_messages ORDER BY created_at DESC LIMIT 100`);
    return rows.reverse();
  });
  res.json({
    messages: data,
    regles: 'Entraide entre parents. Pas de nom complet, de numéro ni de détail médical. Pour une question de santé, écrivez à votre soignant.',
    whatsapp: env.communauteWhatsapp,
    telegram: env.communauteTelegram,
  });
}

async function publier(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: [u] } = await db.query('SELECT prenom, region FROM users WHERE id = $1', [req.user.id]);
    const pseudo = req.user.role === 'SUPER_ADMIN' ? 'Équipe SAMA XHEL' : `${u.prenom}${u.region ? ` (${u.region})` : ''}`;
    const { rows: [m] } = await db.query(
      `INSERT INTO communaute_messages (auteur_id, pseudo, texte) VALUES ($1, $2, $3)
       RETURNING id, pseudo, texte, masque, true AS de_moi, created_at`, [req.user.id, pseudo, proteger(req.body.texte)]);
    return m;
  });
  res.status(201).json({ message: data });
}

async function moderer(req, res) {
  const data = await ctx(req, async (db) => {
    const { rows: [m] } = await db.query(
      'UPDATE communaute_messages SET masque = $1, masque_par = $2, motif_masquage = $3 WHERE id = $4 RETURNING id, masque',
      [req.body.masque, req.user.id, req.body.motif || null, req.params.id]);
    if (!m) throw notFound('Message introuvable');
    return m;
  });
  res.json({ message: data });
}

module.exports = { lister, publier, moderer, proteger };
