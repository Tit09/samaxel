'use strict';
/**
 * Vérifie chaque canal avec les identifiants du fichier .env (aucun identifiant ne s'affiche).
 *
 *   node scripts/tester-notifications.js telegram              → vérifie le bot
 *   node scripts/tester-notifications.js sms +221771234567     → envoie un vrai SMS (Orange)
 *   node scripts/tester-notifications.js whatsapp +221771234567 → envoie le modèle WhatsApp
 *   node scripts/tester-notifications.js email vous@gmail.com
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const env = require('../src/config/env');

const [canal, dest] = process.argv.slice(2);
const TEXTE = 'Test SAMA XHEL : si vous lisez ce message, ce canal fonctionne.';

(async () => {
  if (canal === 'telegram') {
    if (!env.telegram.token) throw new Error('TELEGRAM_BOT_TOKEN manquant dans .env');
    const r = await (await fetch(`https://api.telegram.org/bot${env.telegram.token}/getMe`)).json();
    if (!r.ok) throw new Error(`jeton refusé par Telegram (${r.description})`);
    console.log(`✔ Bot @${r.result.username} joignable.`);
    if (r.result.username !== env.telegram.bot) console.log(`⚠ TELEGRAM_BOT_USERNAME doit valoir ${r.result.username}`);
    console.log('  Reliez votre compte depuis l’application : Profil > Notifications > Relier Telegram.');
  } else if (canal === 'sms') {
    const r = await require('../src/services/canaux/orange').envoyer(dest, TEXTE);
    console.log(`✔ SMS accepté par Orange (référence ${r.id}). Il arrive en général en moins d’une minute.`);
  } else if (canal === 'whatsapp') {
    const r = await require('../src/services/canaux/whatsapp').envoyerModele(dest, TEXTE);
    console.log(`✔ WhatsApp accepté par Meta (${r.id}). En mode test, le numéro doit être dans la liste des 5 destinataires.`);
  } else if (canal === 'email') {
    await require('../src/services/mail.service').sendMail(dest, 'Test SAMA XHEL', TEXTE);
    console.log('✔ E-mail envoyé.');
  } else {
    console.log('Usage : node scripts/tester-notifications.js telegram | sms <+221…> | whatsapp <+221…> | email <adresse>');
  }
  process.exit(0);
})().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
