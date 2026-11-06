'use strict';
/**
 * Jetons d'authentification.
 *  • Access token : JWT court (15 min), contient id, rôle, structure active, jti.
 *  • Refresh token : chaîne aléatoire (48 octets) stockée HACHÉE dans Redis, 30 jours,
 *    à usage unique (rotation) : chaque /refresh en délivre un nouveau.
 *  • Déconnexion : le jti de l'access token est mis en liste noire jusqu'à expiration.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const redis = require('../config/redis');
const { sha256 } = require('../utils/crypto');

const ISSUER = 'sama-xhel-sante';
const ALG = 'ES256';
const KID = crypto.createHash('sha256').update(env.jwt.publicKey).digest('hex').slice(0, 16);
const signer = (payload, options) =>
  jwt.sign(payload, env.jwt.privateKey, { algorithm: ALG, keyid: KID, issuer: ISSUER, ...options });
const verifier = (token, audience) =>
  jwt.verify(token, env.jwt.publicKey, { algorithms: [ALG], issuer: ISSUER, audience });


function signAccess(payload) {
  const jti = crypto.randomUUID();
  return signer(
    {
      sub: payload.id,
      role: payload.role,
      structure_id: payload.structure_id || null,
      // Liste des structures et rôles (cahier des charges F8)
      structures: (payload.structures || []).map((s) => ({ structure_id: s.structure_id, role: s.role })),
      jti,
    },
    { expiresIn: env.jwt.accessTtl, audience: 'api' },
  );
}

function verifyAccess(token) {
  return verifier(token, 'api');
}

/** Jeton temporaire (5 min) entre « mot de passe OK » et « code MFA OK » */
function signMfa(payload) {
  return signer(
    { sub: payload.id, structure_id: payload.structure_id || null, purpose: 'mfa' },
    { expiresIn: '5m', audience: 'mfa' },
  );
}
function verifyMfa(token) {
  return verifier(token, 'mfa');
}

async function createRefresh(userId, structureId) {
  const refresh = crypto.randomBytes(48).toString('base64url');
  const ttl = env.jwt.refreshTtlJours * 24 * 3600;
  await redis.set(
    `refresh:${sha256(refresh)}`,
    JSON.stringify({ user_id: userId, structure_id: structureId || null }),
    'EX', ttl,
  );
  return refresh;
}

/** Consomme un refresh token (usage unique). Renvoie {user_id, structure_id} ou null */
async function consumeRefresh(refresh) {
  const key = `refresh:${sha256(refresh)}`;
  const data = await redis.getdel(key);
  return data ? JSON.parse(data) : null;
}

async function revokeRefresh(refresh) {
  if (refresh) await redis.del(`refresh:${sha256(refresh)}`);
}

async function blacklistAccess(decoded) {
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', ttl);
}

async function isBlacklisted(jti) {
  return (await redis.exists(`blacklist:${jti}`)) === 1;
}

/** Paire de jetons renvoyée au client après connexion */
async function issueTokens(user) {
  return {
    token: signAccess(user),
    refresh_token: await createRefresh(user.id, user.structure_id),
    expires_in: env.jwt.accessTtl,
  };
}

module.exports = {
  signAccess, verifyAccess, signMfa, verifyMfa,
  createRefresh, consumeRefresh, revokeRefresh,
  blacklistAccess, isBlacklisted, issueTokens,
};
