'use strict';
/**
 * Codes à usage unique (OTP) à 6 chiffres : vérification de compte, MFA,
 * réinitialisation du mot de passe.
 *  • Le code est stocké HACHÉ dans Redis, 10 minutes.
 *  • 5 essais maximum, puis le code est détruit.
 *  • Le code part TOUJOURS vers le téléphone/e-mail enregistré du compte,
 *    jamais vers une adresse fournie par la requête (anti-abus SMS).
 */
const crypto = require('crypto');
const redis = require('../config/redis');
const env = require('../config/env');
const { sha256 } = require('../utils/crypto');
const { sendSmsCode, smsConfigure } = require('./sms.service');
const { sendMailCode } = require('./mail.service');
const telegram = require('./canaux/telegram');
const { pool } = require('../config/database');

/** Telegram relié ? (gratuit : préféré au SMS pour les codes) */
async function chatTelegram(userId) {
  if (env.isTest || !telegram.configure()) return null;
  const { rows: [u] } = await pool.query('SELECT telegram_chat_id FROM users WHERE id = $1', [userId]).catch(() => ({ rows: [] }));
  return u?.telegram_chat_id || null;
}

const TTL_S = 600;
const MAX_ESSAIS = 5;

const key = (purpose, userId) => `otp:${purpose}:${userId}`;

// Uniquement pour les tests automatisés (NODE_ENV=test) : dernier code envoyé
const derniersCodes = new Map();

/**
 * @param {'verification'|'mfa'|'reset'} purpose
 * @param {{id:string, telephone?:string, email?:string}} user
 * @param {'sms'|'email'} [canal]
 * @returns {Promise<{canal:string, destination:string}>}
 */
async function envoyerCode(purpose, user, canal) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await redis.set(key(purpose, user.id), JSON.stringify({ h: sha256(code), n: 0 }), 'EX', TTL_S);

  // OTP_CANAL_PREFERE=email : envoi par e-mail quand le compte en a un (utile tant que le compte SMS est en bac à sable)
  const prefereEmail = env.otpCanalPrefere === 'email' && user.email;
  const chat = canal ? null : await chatTelegram(user.id);
  // SMS seulement si un fournisseur est configuré ; sinon e-mail (si possible)
  const smsPossible = user.telephone && (smsConfigure() || env.isTest);
  const mailPossible = user.email && env.mail.user;
  const choix = canal || (chat ? 'telegram' : prefereEmail ? 'email' : smsPossible ? 'sms' : mailPossible ? 'email' : user.telephone ? 'sms' : 'email');
  const destination = choix === 'telegram' ? 'Telegram' : choix === 'sms' ? user.telephone : user.email;
  if (!destination) throw new Error(`Aucun ${choix === 'sms' ? 'téléphone' : 'e-mail'} sur ce compte`);

  if (env.isTest) {
    derniersCodes.set(`${purpose}:${user.id}`, code);
  } else {
    // Hors production, le code est aussi écrit dans le journal (démonstration, débogage)
    if (!env.isProd) console.log(`[OTP:${purpose}] ${destination} -> ${code}`);
    // Comptes de démonstration (adresses @samaxhel.sn fictives) : rien n'est envoyé, le code reste dans le journal
    const fictif = !env.isProd && /[@.]samaxhel\.sn$/i.test(destination);
    // Hors production, un canal non configuré n'empêche pas de tester : le code reste dans le journal du serveur
    const configure = choix === 'telegram' || (choix === 'sms' ? smsConfigure() : Boolean(env.mail.user));
    if (!env.otpConsole && !fictif && (configure || env.isProd)) {
      if (choix === 'telegram') {
        await telegram.envoyer(chat, `SAMA XHEL : votre code est ${code}. Valable 10 minutes. Ne le partagez avec personne.`);
      } else if (choix === 'sms') await sendSmsCode(destination, code);
      else await sendMailCode(destination, code);
    }
  }
  return { canal: choix, destination: masquer(destination) };
}

/** Vérifie le code. Renvoie true/false. Détruit le code après succès ou 5 échecs. */
async function verifierCode(purpose, userId, code) {
  const k = key(purpose, userId);
  const raw = await redis.get(k);
  if (!raw) return { ok: false, raison: 'CODE_EXPIRED' };
  const data = JSON.parse(raw);
  const attendu = Buffer.from(data.h);
  const recu = Buffer.from(sha256(String(code)));
  if (attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu)) {
    await redis.del(k);
    return { ok: true };
  }
  data.n += 1;
  if (data.n >= MAX_ESSAIS) {
    await redis.del(k);
    return { ok: false, raison: 'TOO_MANY_ATTEMPTS' };
  }
  const ttl = await redis.ttl(k);
  await redis.set(k, JSON.stringify(data), 'EX', Math.max(ttl, 1));
  return { ok: false, raison: 'INVALID_CODE' };
}

/** +221 77 *** ** 67  /  fa***@gmail.com */
function masquer(dest) {
  if (dest === 'Telegram') return dest;
  if (dest.includes('@')) {
    const [u, d] = dest.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  return `${dest.slice(0, 6)}*****${dest.slice(-2)}`;
}

module.exports = {
  envoyerCode, verifierCode,
  dernierCodePourTests: (purpose, userId) => (env.isTest ? derniersCodes.get(`${purpose}:${userId}`) : undefined),
};
