'use strict';
/**
 * Profil > Notifications : relier Telegram, accepter WhatsApp, choisir l'ordre des canaux,
 * s'envoyer un message de test. Webhook Telegram (serveur en ligne).
 */
const crypto = require('crypto');
const env = require('../config/env');
const { pool } = require('../config/database');
const telegram = require('../services/canaux/telegram');
const whatsapp = require('../services/canaux/whatsapp');
const { smsConfigure } = require('../services/sms.service');
const { informer, canauxPour } = require('../services/contact.service');
const { badRequest, forbidden } = require('../utils/errors');

async function moi(id) {
  const { rows: [u] } = await pool.query(
    `SELECT id, email, telephone, telegram_chat_id, telegram_relie_le, whatsapp_accepte, canaux_preferes
       FROM users WHERE id = $1`, [id]);
  return u;
}

// ── GET /api/moi/canaux ────────────────────────────────────────────────────
async function etat(req, res) {
  const u = await moi(req.user.id);
  res.json({
    telegram: { disponible: telegram.configure(), relie: Boolean(u.telegram_chat_id), depuis: u.telegram_relie_le },
    whatsapp: { disponible: whatsapp.configure(), accepte: u.whatsapp_accepte, numero: Boolean(u.telephone) },
    sms: { disponible: smsConfigure(), numero: Boolean(u.telephone) },
    email: { disponible: Boolean(env.mail.user), adresse: Boolean(u.email) },
    ordre: canauxPour(u),
    preferes: u.canaux_preferes,
  });
}

// ── PUT /api/moi/canaux ────────────────────────────────────────────────────
async function modifier(req, res) {
  const { whatsapp_accepte, canaux_preferes } = req.body;
  await pool.query(
    `UPDATE users SET whatsapp_accepte = COALESCE($2, whatsapp_accepte),
                      canaux_preferes = COALESCE($3, canaux_preferes) WHERE id = $1`,
    [req.user.id, whatsapp_accepte ?? null, canaux_preferes ?? null]);
  return etat(req, res);
}

// ── POST /api/moi/telegram : lien « t.me/bot?start=… » ────────────────────
async function lienTelegram(req, res) {
  if (!telegram.configure()) throw badRequest('Telegram n’est pas encore activé sur ce serveur', 'TELEGRAM_INDISPONIBLE');
  res.json(await telegram.creerLien(req.user.id));
}

// ── DELETE /api/moi/telegram ──────────────────────────────────────────────
async function delierTelegram(req, res) {
  await pool.query('UPDATE users SET telegram_chat_id = NULL, telegram_relie_le = NULL WHERE id = $1', [req.user.id]);
  res.json({ ok: true });
}

// ── POST /api/moi/canaux/test : « M'envoyer un message de test » ───────────
async function tester(req, res) {
  const canal = req.body.canal;
  const opts = canal
    ? { telegram: canal === 'TELEGRAM', whatsapp: canal === 'WHATSAPP', sms: canal === 'SMS', email: canal === 'EMAIL' }
    : {};
  const reussis = await informer({ id: req.user.id }, 'Message de test',
    'Ceci est un test. Si vous lisez ce message, vos notifications SAMA XHEL fonctionnent.', { ...opts, type: 'TEST' });
  const { rows } = await pool.query(
    `SELECT canal, statut, erreur, created_at FROM envois WHERE user_id = $1 AND type = 'TEST'
      ORDER BY id DESC LIMIT 4`, [req.user.id]);
  res.json({ envoye_par: reussis, derniers_essais: rows });
}

// ── POST /api/telegram/webhook (Telegram → serveur en ligne) ──────────────
async function webhookTelegram(req, res) {
  const recu = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] || ''));
  const attendu = Buffer.from(env.telegram.secretWebhook);
  if (!attendu.length || recu.length !== attendu.length || !crypto.timingSafeEqual(recu, attendu)) {
    throw forbidden('Webhook refusé', 'WEBHOOK_REFUSE');
  }
  await telegram.traiterMiseAJour(req.body).catch((e) => console.error('[Telegram] webhook :', e.message));
  res.json({ ok: true }); // toujours 200 : sinon Telegram renvoie le même message en boucle
}

module.exports = { etat, modifier, lienTelegram, delierTelegram, tester, webhookTelegram };
