'use strict';
/**
 * SMS réels via l'API Orange SMS Sénégal (developer.orange.com/apis/sms-sn).
 * Atteint tous les opérateurs (Orange, Free, Expresso). Facturé au paquet de SMS.
 *
 *  1. Jeton OAuth 2.0 « client credentials » (valable environ 1 h, gardé en mémoire).
 *  2. POST /smsmessaging/v1/outbound/{expéditeur}/requests
 */
const env = require('../../config/env');

const URL_JETON = 'https://api.orange.com/oauth/v3/token';
const URL_ENVOI = 'https://api.orange.com/smsmessaging/v1/outbound';
let jeton = null; // { valeur, expire }

const configure = () => Boolean(env.orangeSms.clientId && env.orangeSms.clientSecret);

async function obtenirJeton() {
  if (jeton && jeton.expire > Date.now() + 60_000) return jeton.valeur;
  const basic = Buffer.from(`${env.orangeSms.clientId}:${env.orangeSms.clientSecret}`).toString('base64');
  const r = await fetch(URL_JETON, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(`Orange : authentification refusée (${r.status} ${data.error || ''})`.trim());
  jeton = { valeur: data.access_token, expire: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return jeton.valeur;
}

/** @param {string} telephone au format +221XXXXXXXXX */
async function envoyer(telephone, message) {
  if (!configure()) throw new Error('SMS Orange non configuré (ORANGE_SMS_CLIENT_ID / ORANGE_SMS_CLIENT_SECRET)');
  if (!/^\+\d{8,15}$/.test(telephone)) throw new Error('Numéro de téléphone invalide');
  const expediteur = env.orangeSms.expediteur;
  const corps = {
    outboundSMSMessageRequest: {
      address: `tel:${telephone}`,
      senderAddress: expediteur,
      outboundSMSTextMessage: { message: message.slice(0, 459) },
      ...(env.orangeSms.nomExpediteur ? { senderName: env.orangeSms.nomExpediteur } : {}),
    },
  };
  const tenter = async () => fetch(`${URL_ENVOI}/${encodeURIComponent(expediteur)}/requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await obtenirJeton()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(15_000),
  });
  let r = await tenter();
  if (r.status === 401) { jeton = null; r = await tenter(); } // jeton expiré côté Orange
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = data?.requestError?.serviceException?.text || data?.requestError?.policyException?.text || data?.message || '';
    throw new Error(`Orange : SMS refusé (${r.status}) ${detail}`.trim());
  }
  const ref = data?.outboundSMSMessageRequest?.resourceURL || '';
  return { id: ref.split('/').pop() || null };
}

/** Solde restant des paquets SMS (pour la supervision) */
async function solde() {
  const r = await fetch('https://api.orange.com/sms/admin/v1/contracts?country=SEN', {
    headers: { Authorization: `Bearer ${await obtenirJeton()}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Orange : solde indisponible (${r.status})`);
  return r.json();
}

module.exports = { envoyer, solde, configure, _reinitialiser: () => { jeton = null; } };
