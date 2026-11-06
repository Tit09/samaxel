'use strict';
/**
 * Génère la paire de clés ES256 (courbe P-256) qui signe les jetons de connexion.
 *   keys/jwt-private.pem → reste UNIQUEMENT sur le serveur Santé (ne jamais partager)
 *   keys/jwt-public.pem  → sert à vérifier les jetons
 * Usage : npm run keys
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(dir, { recursive: true });
const priv = path.join(dir, 'jwt-private.pem');
if (fs.existsSync(priv) && !process.argv.includes('--force')) {
  console.log('[Keys] Les clés existent déjà (ajoutez --force pour les remplacer : toutes les sessions seront déconnectées).');
  process.exit(0);
}
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(path.join(dir, 'jwt-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
console.log('[Keys] ✔ keys/jwt-private.pem et keys/jwt-public.pem générées');
