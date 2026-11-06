'use strict';
const tokens = require('../services/token.service');
const { pool } = require('../config/database');
const redis = require('../config/redis');
const { unauthorized, forbidden, badRequest } = require('../utils/errors');

const ROLES_PRO = ['MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE'];
const ROLES_CLINIQUES = ['MEDECIN', 'THERAPEUTE'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Structures ACTIVES d'un professionnel (cache Redis 60 s) */
async function structuresDuPro(userId) {
  const cle = `membres:${userId}`;
  const cache = await redis.get(cle);
  if (cache) return JSON.parse(cache);
  const { rows } = await pool.query(
    `SELECT m.structure_id, m.role FROM membres_structure m
     JOIN structures s ON s.id = m.structure_id
     WHERE m.user_id = $1 AND m.statut = 'ACTIF' AND s.actif = true`,
    [userId],
  );
  await redis.set(cle, JSON.stringify(rows), 'EX', 60);
  return rows;
}
const invaliderStructuresDuPro = (userId) => redis.del(`membres:${userId}`);

/**
 * Vérifie le JWT « Bearer » et remplit req.user = { id, role, structure_id, jti, exp }.
 * Zero Trust : signature, expiration, liste noire, à chaque requête.
 *
 * Multi-tenant (cahier des charges F8) : l'en-tête X-Structure-Id choisit la
 * structure ACTIVE sans se reconnecter.
 *  • Professionnel : la structure doit être une de SES structures actives ;
 *    son rôle est celui qu'il a DANS cette structure (relu en base).
 *  • Parent : l'en-tête limite l'affichage au dossier de cette structure.
 */
async function verifyToken(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw unauthorized('Token manquant', 'MISSING_TOKEN');
  let decoded;
  try {
    decoded = tokens.verifyAccess(header.slice(7));
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw unauthorized('Session expirée', 'EXPIRED_TOKEN');
    throw unauthorized('Token invalide', 'INVALID_TOKEN');
  }
  if (await tokens.isBlacklisted(decoded.jti)) throw unauthorized('Session fermée', 'REVOKED_TOKEN');

  const user = {
    id: decoded.sub,
    role: decoded.role,
    structure_id: decoded.structure_id || null,
    jti: decoded.jti,
    exp: decoded.exp,
  };

  const demandee = req.headers['x-structure-id'];
  if (demandee !== undefined && demandee !== '') {
    if (!UUID.test(demandee)) throw badRequest('X-Structure-Id invalide', 'INVALID_STRUCTURE_ID');
    if (ROLES_PRO.includes(user.role)) {
      const membres = await structuresDuPro(user.id);
      const m = membres.find((x) => x.structure_id === demandee);
      if (!m) throw forbidden('Vous n’êtes pas membre actif de cette structure', 'NOT_A_MEMBER');
      user.structure_id = m.structure_id;
      user.role = m.role;
    } else if (user.role === 'PARENT') {
      user.structure_id = demandee;
    }
  } else if (ROLES_PRO.includes(user.role)) {
    // Sans en-tête : on revérifie que l'adhésion du jeton est toujours active
    const membres = await structuresDuPro(user.id);
    const m = membres.find((x) => x.structure_id === user.structure_id);
    if (!m) throw forbidden('Votre accès à cette structure a été retiré', 'MEMBERSHIP_REVOKED');
    user.role = m.role;
  }

  req.user = user;
  next();
}

/** Authentification facultative (routes publiques enrichies si connecté) */
async function optionalToken(req, res, next) {
  if (!req.headers.authorization) return next();
  return verifyToken(req, res, next);
}

/**
 * Contrôle de rôle. Exemple : checkRole('MEDECIN', 'THERAPEUTE')
 * Rôles : PARENT, MEDECIN, THERAPEUTE, SECRETAIRE, ADMIN_STRUCTURE, SUPER_ADMIN
 */
const checkRole = (...roles) => (req, _res, next) => {
  if (!req.user) throw unauthorized();
  if (!roles.flat().includes(req.user.role)) {
    throw forbidden('Accès refusé — rôle insuffisant', 'FORBIDDEN_ROLE');
  }
  next();
};

module.exports = {
  verifyToken, optionalToken, checkRole, ROLES_PRO, ROLES_CLINIQUES, invaliderStructuresDuPro,
};
