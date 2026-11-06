'use strict';
/**
 * Génère, SUR VOTRE ORDINATEUR, les secrets à coller dans Render (Environment) :
 *   node scripts/secrets-render.js
 * Rien n'est envoyé nulle part. Gardez ces valeurs : si DATA_ENCRYPTION_KEY change,
 * les données déjà chiffrées dans la base deviennent illisibles.
 */
const crypto = require('crypto');
const hex = () => crypto.randomBytes(32).toString('hex');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const b64 = (k, type) => Buffer.from(k.export({ type, format: 'pem' })).toString('base64');
const v = {
  DATA_ENCRYPTION_KEY: hex(),
  DATA_INDEX_KEY: hex(),
  APP_DB_PASSWORD: hex(),
  TELEGRAM_WEBHOOK_SECRET: hex(),
  JWT_PRIVATE_KEY: b64(privateKey, 'pkcs8'),
  JWT_PUBLIC_KEY: b64(publicKey, 'spki'),
};
console.log('\nCopiez chaque ligne dans Render → votre service → Environment → Add Environment Variable :\n');
for (const [k, val] of Object.entries(v)) console.log(`${k}=${val}`);
console.log('\nGardez une copie de ces valeurs dans un endroit sûr (gestionnaire de mots de passe).\n');
