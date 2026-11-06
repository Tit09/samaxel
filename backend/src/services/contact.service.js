'use strict';
/**
 * Prévenir quelqu'un EN DEHORS de l'application : codes, rappels de rendez-vous, convocations,
 * alertes aux médecins. Du moins cher au plus cher, on s'arrête au premier canal qui réussit :
 *
 *     Telegram (gratuit) → WhatsApp (gratuit en test, puis par message) → SMS (payant) → e-mail
 *
 * L'utilisateur peut imposer son ordre (users.canaux_preferes). Un canal non relié ou non
 * configuré est sauté. Un échec d'envoi n'annule jamais l'action métier : il est journalisé
 * dans la table envois (sans le contenu). Aucune donnée de santé dans ces messages.
 */
const env = require('../config/env');
const { pool } = require('../config/database');
const { sendSms, smsConfigure } = require('./sms.service');
const { sendMail } = require('./mail.service');
const telegram = require('./canaux/telegram');
const whatsapp = require('./canaux/whatsapp');

const ORDRE_DEFAUT = ['TELEGRAM', 'WHATSAPP', 'SMS', 'EMAIL'];

/** Canaux réellement utilisables pour ce destinataire, dans l'ordre d'essai */
function canauxPour(d, { sms = true, email = true, whatsapp: wa = true, telegram: tg = true } = {}) {
  const ordre = d.canaux_preferes?.length ? [...d.canaux_preferes, ...ORDRE_DEFAUT.filter((c) => !d.canaux_preferes.includes(c))] : ORDRE_DEFAUT;
  return ordre.filter((c) => {
    if (c === 'TELEGRAM') return tg && d.telegram_chat_id && telegram.configure();
    if (c === 'WHATSAPP') return wa && d.whatsapp_accepte && d.telephone && whatsapp.configure();
    if (c === 'SMS') return sms && d.telephone && smsConfigure();
    if (c === 'EMAIL') return email && d.email && env.mail.user;
    return false;
  });
}

async function envoyerPar(canal, d, titre, corps) {
  if (canal === 'TELEGRAM') return telegram.envoyer(d.telegram_chat_id, `SAMA XHEL — ${titre}\n\n${corps}`);
  if (canal === 'WHATSAPP') return whatsapp.envoyerModele(d.telephone, corps);
  if (canal === 'SMS') return sendSms(d.telephone, `SAMA XHEL : ${corps}`);
  if (canal === 'EMAIL') return sendMail(d.email, `SAMA XHEL — ${titre}`, corps);
  throw new Error(`canal inconnu ${canal}`);
}

async function journaliser(userId, canal, type, statut, erreur, id) {
  await pool.query(
    'INSERT INTO envois (user_id, canal, type, statut, erreur, fournisseur_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId || null, canal, type, statut, erreur ? String(erreur).slice(0, 300) : null, id || null],
  ).catch((e) => console.error('[Envoi] journal :', e.message));
}

/** Complète le destinataire avec ses canaux reliés (Telegram, WhatsApp, préférences) */
async function completer(destinataire) {
  if (!destinataire?.id) return destinataire || {};
  const { rows: [u] } = await pool.query(
    `SELECT id, email, telephone, telegram_chat_id, whatsapp_accepte, canaux_preferes
       FROM users WHERE id = $1 AND is_active`, [destinataire.id]);
  return u ? { ...u, ...Object.fromEntries(Object.entries(destinataire).filter(([, v]) => v != null)) } : destinataire;
}

/**
 * @param {{id?:string, email?:string, telephone?:string}} destinataire
 * @param {string} titre  @param {string} corps
 * @param {{sms?:boolean, email?:boolean, whatsapp?:boolean, telegram?:boolean, type?:string, tous?:boolean}} [opts]
 *        tous=true : envoie sur TOUS les canaux disponibles (alerte urgente à un médecin)
 * @returns {Promise<string[]>} canaux qui ont réussi
 */
async function informer(destinataire, titre, corps, opts = {}) {
  const d = await completer(destinataire);
  const type = opts.type || 'INFO';
  const reussis = [];
  for (const canal of canauxPour(d, opts)) {
    try {
      const r = await envoyerPar(canal, d, titre, corps);
      reussis.push(canal);
      await journaliser(d.id, canal, type, 'ENVOYE', null, r?.id);
      if (!opts.tous) break;
    } catch (err) {
      console.error(`[Envoi] ${canal} impossible :`, err.message);
      await journaliser(d.id, canal, type, 'ECHEC', err.message);
    }
  }
  if (!env.isProd && !reussis.length) console.log(`[Info] ${titre} → ${d.email || d.telephone || d.id} : aucun canal disponible`);
  return reussis.map((c) => c.toLowerCase());
}

module.exports = { informer, canauxPour, ORDRE_DEFAUT };
