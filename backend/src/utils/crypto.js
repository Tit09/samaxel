'use strict';
/**
 * Chiffrement applicatif des données de santé — AES-256-GCM.
 *
 * Pourquoi côté application et pas avec pgcrypto ?
 *  • La clé ne transite jamais vers la base (ni dans les logs PostgreSQL).
 *  • Un administrateur de base ou une fuite de sauvegarde ne révèle rien.
 *  • GCM garantit aussi l'INTÉGRITÉ : une donnée modifiée est détectée.
 *
 * Format stocké : "v1:<iv base64>:<tag base64>:<chiffré base64>"
 */
const crypto = require('crypto');
const env = require('../config/env');

const VERSION = 'v1';
// Étiquette d'authentification GCM : 16 octets imposés au déchiffrement (une étiquette
// raccourcie, plus facile à falsifier, est refusée).
const TAG = { authTagLength: 16 };

function chiffrer(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', env.crypto.encryptionKey, iv, TAG);
  const chiffre = Buffer.concat([cipher.update(String(valeur), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), chiffre.toString('base64')].join(':');
}

function dechiffrer(stocke) {
  if (!stocke) return null;
  const [version, iv, tag, chiffre] = String(stocke).split(':');
  if (version !== VERSION) throw new Error('Format de chiffrement inconnu');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', env.crypto.encryptionKey, Buffer.from(iv, 'base64'), TAG,
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(chiffre, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const chiffrerJson = (obj) => chiffrer(JSON.stringify(obj));

/** Fichiers binaires (vocaux) : iv(12) | tag(16) | chiffré — stockés en bytea */
function chiffrerOctets(octets) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', env.crypto.encryptionKey, iv, TAG);
  const chiffre = Buffer.concat([cipher.update(octets), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), chiffre]);
}
function dechiffrerOctets(stocke) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', env.crypto.encryptionKey, stocke.subarray(0, 12), TAG);
  decipher.setAuthTag(stocke.subarray(12, 28));
  return Buffer.concat([decipher.update(stocke.subarray(28)), decipher.final()]);
}
const dechiffrerJson = (s) => (s ? JSON.parse(dechiffrer(s)) : null);

/**
 * Index aveugle : HMAC-SHA256 avec une clé secrète.
 * Un simple SHA-256 du nom (« Diallo ») se retrouve en 1 seconde avec un
 * dictionnaire de noms sénégalais. Le HMAC sans la clé est inexploitable.
 */
function normaliser(v) {
  return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
function indexAveugle(valeur) {
  return crypto.createHmac('sha256', env.crypto.indexKey).update(normaliser(valeur)).digest('hex');
}

/** Hachage rapide pour les jetons (refresh, OTP) stockés dans Redis */
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

module.exports = { chiffrer, dechiffrer, chiffrerJson, dechiffrerJson, chiffrerOctets, dechiffrerOctets, indexAveugle, sha256 };
