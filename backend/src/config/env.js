'use strict';
/**
 * Chargement et validation des variables d'environnement.
 * Si une variable obligatoire manque, le serveur refuse de démarrer
 * avec un message clair (au lieu de planter plus tard de façon obscure).
 */
require('dotenv').config({ quiet: true });

// ── Compatibilité avec l'ancien .env du projet (noms de variables d'origine) ──
// DB_USER / DB_PASSWORD de l'ancien fichier → compte applicatif de la base.
if (!process.env.APP_DB_USER && process.env.DB_USER) process.env.APP_DB_USER = process.env.DB_USER;
if (!process.env.APP_DB_PASSWORD && process.env.DB_PASSWORD) process.env.APP_DB_PASSWORD = process.env.DB_PASSWORD;
if (process.env.BREVO_API_KEY && !process.env.MAIL_USER) {
  process.env.MAIL_USER = (process.env.MAIL_FROM || '').match(/<([^>]+)>/)?.[1] || process.env.MAIL_FROM || 'brevo';
  process.env.MAIL_HOST = 'api.brevo.com';
}
// Gmail : l'ancien fichier ne précisait pas le serveur SMTP.
if (!process.env.MAIL_HOST && /@gmail\.com$/i.test(process.env.MAIL_USER || '')) process.env.MAIL_HOST = 'smtp.gmail.com';
// Variables de l'ancien backend remplacées par un mécanisme plus sûr (on prévient au lieu d'ignorer en silence).
const remplacees = {
  JWT_SECRET: 'jetons signés en ES256 avec une paire de clés (keys/), pas un secret partagé',
  JWT_EXPIRES_IN: 'jeton d’accès de 15 min (JWT_ACCESS_TTL) + renouvellement à usage unique',
  JWT_REFRESH_EXPIRES_IN: 'JWT_REFRESH_TTL_JOURS',
  PGP_PASSPHRASE: 'chiffrement AES-256-GCM dans l’application (DATA_ENCRYPTION_KEY)',
  PGCRYPTO_KEY: 'chiffrement AES-256-GCM dans l’application (DATA_ENCRYPTION_KEY)',
};
for (const [k, remplace] of Object.entries(remplacees)) {
  if (process.env[k] && process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn(`[Config] ${k} n’est plus utilisée → ${remplace}.`);
  }
}

// Hébergement en ligne (Render…) : Redis donné par une seule adresse REDIS_URL
const obligatoires = [
  'DB_HOST', 'DB_PORT', 'DB_NAME', 'APP_DB_USER', 'APP_DB_PASSWORD',
  ...(process.env.REDIS_URL ? [] : ['REDIS_HOST', 'REDIS_PORT']),
  'DATA_ENCRYPTION_KEY', 'DATA_INDEX_KEY',
];

const manquantes = obligatoires.filter((k) => !process.env[k]);
if (manquantes.length) {
  // eslint-disable-next-line no-console
  console.error(`[Config] Variables manquantes dans .env : ${manquantes.join(', ')}`);
  console.error('[Config] Copiez .env.example vers .env et complétez-le.');
  process.exit(1);
}

const hex64 = /^[0-9a-f]{64}$/i;
for (const k of ['DATA_ENCRYPTION_KEY', 'DATA_INDEX_KEY']) {
  if (!hex64.test(process.env[k])) {
    console.error(`[Config] ${k} doit contenir 64 caractères hexadécimaux (32 octets).`);
    console.error('[Config] Générez-en une avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
}
// Clés de signature des jetons (ES256) : la privée signe, la publique vérifie.
const fs = require('fs');
const path = require('path');
const lireCle = (variable, defaut) => {
  // En ligne, le disque est effacé à chaque redémarrage : la clé est alors donnée par une
  // variable d'environnement (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY, PEM encodé en base64).
  const enVariable = process.env[variable.replace(/_FILE$/, '')];
  if (enVariable) return enVariable.includes('BEGIN') ? enVariable.replace(/\\n/g, '\n') : Buffer.from(enVariable, 'base64').toString('utf8');
  const fichier = path.resolve(process.env[variable] || defaut);
  if (!fs.existsSync(fichier)) {
    console.error(`[Config] Clé introuvable : ${fichier}`);
    console.error('[Config] Générez les clés avec : npm run keys');
    process.exit(1);
  }
  return fs.readFileSync(fichier, 'utf8');
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  trustProxy: process.env.TRUST_PROXY === 'true',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),

  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.APP_DB_USER,
    password: process.env.APP_DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  },

  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    privateKey: lireCle('JWT_PRIVATE_KEY_FILE', 'keys/jwt-private.pem'),
    publicKey: lireCle('JWT_PUBLIC_KEY_FILE', 'keys/jwt-public.pem'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlJours: parseInt(process.env.JWT_REFRESH_TTL_JOURS || '30', 10),
  },

  crypto: {
    encryptionKey: Buffer.from(process.env.DATA_ENCRYPTION_KEY, 'hex'),
    indexKey: Buffer.from(process.env.DATA_INDEX_KEY, 'hex'),
  },

  argon2: {
    memoryCost: parseInt(process.env.ARGON2_MEMORY || '19456', 10),
    timeCost: parseInt(process.env.ARGON2_TIME || '2', 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM || '1', 10),
  },

  // En développement seulement : affiche les codes OTP dans la console
  otpConsole: process.env.OTP_CONSOLE === 'true',
  otpCanalPrefere: (process.env.OTP_CANAL_PREFERE || '').toLowerCase(),

  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM || 'SAMA XHEL <no-reply@samaxhel.sn>',
    // Hébergeurs gratuits qui bloquent le SMTP (Render) : envoi par l'API HTTPS de Brevo (300 e-mails/jour gratuits)
    brevoKey: process.env.BREVO_API_KEY,
  },

  // Fournisseur SMS : « orange » (API Orange SMS Sénégal, tous opérateurs) ou « africastalking »
  smsFournisseur: (process.env.SMS_FOURNISSEUR || (process.env.ORANGE_SMS_CLIENT_ID ? 'orange' : 'africastalking')).toLowerCase(),
  orangeSms: {
    clientId: process.env.ORANGE_SMS_CLIENT_ID,
    clientSecret: process.env.ORANGE_SMS_CLIENT_SECRET,
    expediteur: process.env.ORANGE_SMS_SENDER || 'tel:+2210000',
    nomExpediteur: process.env.ORANGE_SMS_SENDER_NAME || '',
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    bot: (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, ''),
    // polling : le serveur va chercher les messages (marche derrière une box, sans adresse publique)
    // webhook : Telegram appelle /api/telegram/webhook (serveur en ligne avec HTTPS)
    mode: process.env.TELEGRAM_MODE || 'polling',
    secretWebhook: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    numeroId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    version: process.env.WHATSAPP_API_VERSION || 'v21.0',
    // Message hors fenêtre de 24 h = modèle approuvé par Meta. En test : « hello_world » (en_US, sans variable).
    modele: process.env.WHATSAPP_TEMPLATE || 'hello_world',
    langueModele: process.env.WHATSAPP_TEMPLATE_LANG || 'en_US',
    modeleAvecTexte: process.env.WHATSAPP_TEMPLATE_HAS_TEXT === 'true',
  },
  sms: {
    username: process.env.AFRICASTALKING_USERNAME,
    apiKey: process.env.AFRICASTALKING_API_KEY,
    senderId: process.env.AFRICASTALKING_SENDER_ID,
  },

  // Relais TURN (coturn) pour la visio WebRTC quand la connexion directe est impossible
  turn: {
    url: process.env.TURN_URL || '',          // ex. turn:visio.samaxhel.sn:3478?transport=udp,turns:visio.samaxhel.sn:5349
    secret: process.env.TURN_SECRET || '',    // = static-auth-secret de coturn
  },

  // Service d'IA vocale interne (transcription), voir ../ia-voix
  iaVoix: {
    url: process.env.IA_VOIX_URL,
    cle: process.env.IA_VOIX_CLE || '',
  },

  // USSD : adresses IP d'Africa's Talking autorisées à appeler /api/ussd (vide = pas de filtre, développement)
  ussdIpAutorisees: (process.env.USSD_IP_AUTORISEES || '').split(',').map((s) => s.trim()).filter(Boolean),

  // Groupe des parents : lien facultatif vers une communauté WhatsApp officielle
  communauteWhatsapp: process.env.COMMUNAUTE_WHATSAPP_URL || null,
  communauteTelegram: process.env.COMMUNAUTE_TELEGRAM_URL || null,

  fcmServiceAccount: process.env.FCM_SERVICE_ACCOUNT_JSON,

  // Dons : Wave Checkout (compte marchand) ou lien de paiement simple
  wave: {
    apiKey: process.env.WAVE_API_KEY,
    webhookSecret: process.env.WAVE_WEBHOOK_SECRET,
    lienPaiement: process.env.WAVE_LIEN_PAIEMENT,
    successUrl: process.env.DON_SUCCESS_URL || 'https://samaxhel.sn/#don',
    errorUrl: process.env.DON_ERROR_URL || 'https://samaxhel.sn/#don',
  },
};

env.isProd = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

if (env.isProd && env.otpConsole) {
  console.error('[Config] OTP_CONSOLE=true est interdit en production.');
  process.exit(1);
}

module.exports = env;
