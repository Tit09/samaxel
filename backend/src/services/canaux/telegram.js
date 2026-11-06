'use strict';
/**
 * Telegram : gratuit, illimité, livré en quelques secondes, accepte texte ET messages vocaux.
 *
 * Relier un compte : l'application ouvre https://t.me/<bot>?start=<jeton> ; l'utilisateur appuie
 * sur « Démarrer » ; le bot reçoit « /start <jeton> » et enregistre son chat_id.
 * Le jeton (aléatoire, 10 min, usage unique) est gardé dans Redis : personne ne peut relier
 * le Telegram d'un autre compte.
 *
 * Réception des messages du bot :
 *   • polling (par défaut) : le serveur interroge Telegram — marche sur un PC derrière une box ;
 *   • webhook : Telegram appelle POST /api/telegram/webhook (serveur public en HTTPS).
 */
const crypto = require('crypto');
const env = require('../../config/env');
const redis = require('../../config/redis');
const { pool } = require('../../config/database');

const API = () => `https://api.telegram.org/bot${env.telegram.token}`;
const configure = () => Boolean(env.telegram.token && env.telegram.bot);

async function appel(methode, corps) {
  const r = await fetch(`${API()}/${methode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(methode === 'getUpdates' ? 40_000 : 10_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram : ${data.description || r.status}`);
  return data.result;
}

async function envoyer(chatId, texte) {
  if (!configure()) throw new Error('Telegram non configuré (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME)');
  const m = await appel('sendMessage', { chat_id: chatId, text: texte.slice(0, 4000), disable_web_page_preview: true });
  return { id: String(m.message_id) };
}

/** Message vocal (fichier OGG/Opus) — pour les rappels dans la langue du parent */
async function envoyerVocal(chatId, audio, legende = '') {
  if (!configure()) throw new Error('Telegram non configuré');
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (legende) form.set('caption', legende.slice(0, 1000));
  form.set('voice', new Blob([audio], { type: 'audio/ogg' }), 'rappel.ogg');
  const r = await fetch(`${API()}/sendVoice`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram : ${data.description || r.status}`);
  return { id: String(data.result.message_id) };
}

/** Crée le lien qui relie le compte SAMA XHEL à Telegram */
async function creerLien(userId) {
  if (!configure()) throw new Error('Telegram non configuré');
  const jeton = crypto.randomBytes(18).toString('base64url'); // 24 caractères, autorisé par Telegram (max 64)
  await redis.set(`tg:lien:${jeton}`, userId, 'EX', 600);
  return { url: `https://t.me/${env.telegram.bot}?start=${jeton}`, expire_dans_s: 600 };
}

/** Traite un message reçu par le bot (polling ou webhook) */
async function traiterMiseAJour(maj) {
  const msg = maj?.message;
  if (!msg?.chat?.id || typeof msg.text !== 'string') return null;
  const chatId = String(msg.chat.id);
  const [commande, jeton] = msg.text.trim().split(/\s+/);

  if (commande === '/start' && jeton) {
    const userId = await redis.getdel(`tg:lien:${jeton}`);
    if (!userId) {
      await envoyer(chatId, 'Ce lien a expiré. Ouvrez SAMA XHEL > Profil > Notifications et appuyez à nouveau sur « Relier Telegram ».').catch(() => {});
      return { action: 'LIEN_EXPIRE' };
    }
    // Un chat Telegram ne peut être relié qu'à un seul compte
    await pool.query('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1 AND id <> $2', [chatId, userId]);
    const r = await pool.query(
      'UPDATE users SET telegram_chat_id = $1, telegram_relie_le = NOW() WHERE id = $2 RETURNING prenom', [chatId, userId]);
    await envoyer(chatId, `✅ C'est fait${r.rows[0] ? `, ${r.rows[0].prenom}` : ''} ! Vous recevrez ici vos codes, vos rappels de rendez-vous et les messages de votre établissement.\nPour arrêter : /stop`).catch(() => {});
    return { action: 'RELIE', userId };
  }
  if (commande === '/stop') {
    await pool.query('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1', [chatId]);
    await envoyer(chatId, 'Vous ne recevrez plus de messages SAMA XHEL ici. Pour revenir : application > Profil > Notifications.').catch(() => {});
    return { action: 'ARRETE' };
  }
  await envoyer(chatId, 'Bonjour 👋 Ce fil sert seulement aux notifications SAMA XHEL. Pour parler à votre établissement, utilisez l’application.').catch(() => {});
  return { action: 'IGNORE' };
}

// ── Polling (un seul processus à la fois grâce à un verrou Redis) ──────────
let actif = false;
async function demarrerPolling() {
  // En ligne (Render…) : Telegram appelle le serveur (webhook) — ce qui le réveille s'il dormait
  const urlPublique = process.env.URL_PUBLIQUE || process.env.RENDER_EXTERNAL_URL;
  if (configure() && !env.isTest && env.telegram.mode === 'webhook' && urlPublique) {
    try {
      await appel('setWebhook', {
        url: `${urlPublique.replace(/\/$/, '')}/api/telegram/webhook`,
        secret_token: env.telegram.secretWebhook || undefined, allowed_updates: ['message'],
      });
      console.log(`[Telegram] Bot @${env.telegram.bot} relié par webhook`);
    } catch (e) { console.error('[Telegram] webhook :', e.message); }
    return;
  }
  if (!configure() || env.telegram.mode !== 'polling' || env.isTest || actif) return;
  actif = true;
  let decalage = 0;
  try { await appel('deleteWebhook', { drop_pending_updates: false }); } catch (e) { console.error('[Telegram]', e.message); }
  console.log(`[Telegram] Bot @${env.telegram.bot} à l'écoute (polling)`);
  while (actif) {
    const verrou = await redis.set('tg:polling', process.pid, 'EX', 60, 'NX') || (await redis.get('tg:polling')) === String(process.pid);
    if (!verrou) { await new Promise((ok) => setTimeout(ok, 30_000)); continue; }
    await redis.expire('tg:polling', 60);
    try {
      const majs = await appel('getUpdates', { offset: decalage, timeout: 30, allowed_updates: ['message'] });
      for (const m of majs) {
        decalage = m.update_id + 1;
        await traiterMiseAJour(m).catch((e) => console.error('[Telegram] message non traité :', e.message));
      }
    } catch (e) {
      console.error('[Telegram] polling :', e.message);
      await new Promise((ok) => setTimeout(ok, 5_000));
    }
  }
}
const arreterPolling = () => { actif = false; };

module.exports = { envoyer, envoyerVocal, creerLien, traiterMiseAJour, demarrerPolling, arreterPolling, configure };
