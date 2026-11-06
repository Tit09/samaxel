'use strict';
/**
 * Envoi de SMS. Fournisseur choisi par SMS_FOURNISSEUR :
 *   • orange (par défaut dès que ORANGE_SMS_CLIENT_ID est renseigné) : API Orange SMS Sénégal, SMS réels ;
 *   • africastalking : ancien fournisseur (le bac à sable ne livre jamais de vrai SMS).
 *
 * Africa's Talking : API REST (sans SDK : le SDK officiel
 * embarque des dépendances vulnérables — voir npm audit).
 * Documentation : https://developers.africastalking.com/docs/sms/sending
 */
const env = require('../config/env');

const URL_PROD = 'https://api.africastalking.com/version1/messaging';
const URL_SANDBOX = 'https://api.sandbox.africastalking.com/version1/messaging';

const orange = require('./canaux/orange');

const smsConfigure = () => (env.smsFournisseur === 'orange' ? orange.configure() : Boolean(env.sms.username && env.sms.apiKey));

async function sendSms(telephone, message) {
  if (env.smsFournisseur === 'orange') return orange.envoyer(telephone, message);
  return sendSmsAfricasTalking(telephone, message);
}

async function sendSmsAfricasTalking(telephone, message) {
  if (!env.sms.username || !env.sms.apiKey) {
    throw new Error('SMS non configuré (AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY)');
  }
  const body = new URLSearchParams({ username: env.sms.username, to: telephone, message });
  if (env.sms.senderId) body.set('from', env.sms.senderId); // ID expéditeur validé par Africa's Talking
  const r = await fetch(env.sms.username === 'sandbox' ? URL_SANDBOX : URL_PROD, {
    method: 'POST',
    headers: { apiKey: env.sms.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Africa's Talking a répondu ${r.status}`);
  const data = await r.json();
  const dest = data?.SMSMessageData?.Recipients?.[0];
  if (!dest || !['Success', 'Sent'].includes(dest.status)) {
    throw new Error(`SMS non envoyé : ${dest?.status || data?.SMSMessageData?.Message || 'réponse inattendue'}`);
  }
}

const sendSmsCode = (telephone, code) =>
  sendSms(telephone, `SAMA XHEL : votre code est ${code}. Valable 10 minutes. Ne le partagez avec personne.`);

module.exports = { sendSms, sendSmsCode, smsConfigure };
