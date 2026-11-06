'use strict';
/**
 * Crée le fichier .env du SERVEUR, directement sur le serveur.
 *
 *  • Génère tout seul les mots de passe de la base, de Redis, les clés de chiffrement
 *    et les clés des jetons (personne ne les voit, ils ne transitent nulle part).
 *  • Demande seulement les identifiants Orange SMS (et, si vous voulez, Gmail) :
 *    la saisie est masquée et ne passe ni par le chat, ni par un zip, ni par GitHub.
 *
 * Usage (sur le serveur, dans le dossier backend) :  node scripts/configurer-serveur.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const FICHIER = path.join(__dirname, '..', '.env');
const fort = (n = 24) => crypto.randomBytes(n).toString('base64url');
const hex32 = () => crypto.randomBytes(32).toString('hex');

// Une seule interface pour toutes les questions ; les saisies secrètes s'affichent en « • »
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let masquer = false;
rl._writeToOutput = (t) => { rl.output.write(masquer && !/[\r\n]/.test(t) ? '•'.repeat(t.length) : t); };
function demander(question, { masque = false, defaut = '' } = {}) {
  return new Promise((ok) => {
    rl.output.write(`${question}${defaut ? ` [${defaut}]` : ''} : `);
    masquer = masque;
    rl.question('', (r) => { masquer = false; ok(r.trim() || defaut); });
  });
}

(async () => {
  if (fs.existsSync(FICHIER) && !process.argv.includes('--force')) {
    console.log('Un fichier .env existe déjà. Relancez avec --force pour le remplacer');
    console.log('(⚠ une nouvelle DATA_ENCRYPTION_KEY rend illisibles les données déjà chiffrées).');
    process.exit(0);
  }
  console.log('\n=== Configuration du serveur SAMA XHEL Santé ===\n');
  const domaine = await demander('Adresse publique du serveur (ex. samaxhel.duckdns.org)');
  const orangeId = await demander('Orange SMS — Client ID', { masque: true });
  const orangeSecret = await demander('Orange SMS — Client secret', { masque: true });
  const orangeExp = await demander('Orange SMS — numéro expéditeur (format tel:+221…)', { defaut: 'tel:+2210000' });
  const tgToken = await demander('Telegram — jeton du bot donné par @BotFather (Entrée pour passer)', { masque: true });
  const tgBot = tgToken ? await demander('Telegram — nom du bot (ex. samaxhel_bot)') : '';
  const waToken = await demander('WhatsApp — jeton d’accès Meta (Entrée pour passer)', { masque: true });
  const waNumero = waToken ? await demander('WhatsApp — Phone number ID') : '';
  const mailUser = await demander('Gmail pour les codes par e-mail (Entrée pour passer)');
  const mailPass = mailUser ? await demander('Mot de passe d’application Gmail', { masque: true }) : '';

  const env = `# Généré sur le serveur le ${new Date().toISOString().slice(0, 10)} — ne jamais copier ce fichier ailleurs
NODE_ENV=production
PORT=3001
TRUST_PROXY=true
CORS_ORIGINS=https://${domaine}
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=samaxhel
DB_SSL=false
DB_ADMIN_USER=samaxhel_admin
DB_ADMIN_PASSWORD=${fort()}
APP_DB_USER=samaxhel_app
APP_DB_PASSWORD=${fort()}
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=${fort()}
DATA_ENCRYPTION_KEY=${hex32()}
DATA_INDEX_KEY=${hex32()}
JWT_PRIVATE_KEY_FILE=keys/jwt-private.pem
JWT_PUBLIC_KEY_FILE=keys/jwt-public.pem
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_JOURS=30
ARGON2_MEMORY=19456
ARGON2_TIME=2
ARGON2_PARALLELISM=1
OTP_CONSOLE=false
OTP_CANAL_PREFERE=sms
ORANGE_SMS_CLIENT_ID=${orangeId}
ORANGE_SMS_CLIENT_SECRET=${orangeSecret}
ORANGE_SMS_SENDER=${orangeExp}
ORANGE_SMS_SENDER_NAME=SAMA XHEL
TELEGRAM_BOT_TOKEN=${tgToken}
TELEGRAM_BOT_USERNAME=${tgBot}
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_SECRET=${fort(32)}
WHATSAPP_TOKEN=${waToken}
WHATSAPP_PHONE_NUMBER_ID=${waNumero}
WHATSAPP_TEMPLATE=hello_world
WHATSAPP_TEMPLATE_LANG=en_US
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=${mailUser}
MAIL_PASS=${mailPass}
MAIL_FROM=SAMA XHEL <${mailUser || 'no-reply@samaxhel.sn'}>
FCM_SERVICE_ACCOUNT_JSON=
MODE_DEMONSTRATION=true
`;
  rl.close();
  fs.writeFileSync(FICHIER, env, { mode: 0o600 });
  require('./generate-keys');
  console.log('\n✔ .env créé (lisible seulement par vous). Mots de passe et clés générés automatiquement.');
  console.log('⚠ Sauvegardez DATA_ENCRYPTION_KEY hors du serveur (gestionnaire de mots de passe) : sans elle, les données chiffrées sont perdues.');
})();
