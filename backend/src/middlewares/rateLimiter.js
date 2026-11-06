'use strict';
const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

const msg = (code, error) => ({ error, code });
const skip = () => env.isTest;

/**
 * Connexion / inscription / codes : 10 essais par 15 min pour UN MÊME compte depuis une même IP,
 * et 200 par 15 min pour toute l'IP. Un hôpital entier sort souvent par une seule adresse IP (NAT) :
 * l'accueil, la caisse et les médecins doivent pouvoir se connecter, mais un robot qui essaie
 * des mots de passe sur un compte est bloqué au 10e essai (le compte se verrouille aussi au 5e).
 */
const compteEtIp = (req) => {
  const id = String(req.body?.identifier || req.body?.email || req.body?.telephone || '').trim().toLowerCase().slice(0, 120);
  return `${ipKeyGenerator(req.ip)}|${crypto.createHash('sha256').update(id).digest('base64url').slice(0, 16)}`;
};
const parCompte = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: compteEtIp,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: msg('RATE_LIMIT_AUTH', 'Trop de tentatives — réessayez dans 15 minutes'),
});
const parIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: msg('RATE_LIMIT_AUTH', 'Trop de tentatives depuis ce réseau — réessayez dans 15 minutes'),
});
const authLimiter = [parIp, parCompte];

/**
 * Compte par utilisateur connecté (empreinte du jeton) et sinon par IP :
 * tout un hôpital derrière la même adresse IP (NAT) ne doit pas être bloqué par un seul poste.
 */
const parUtilisateur = (req) => {
  const a = req.headers.authorization;
  return a ? `u:${crypto.createHash('sha256').update(a).digest('base64url').slice(0, 22)}` : `ip:${ipKeyGenerator(req.ip)}`;
};

/** API générale : 600 requêtes par 15 min et par utilisateur (ou par IP sans connexion) */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  keyGenerator: parUtilisateur,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // USSD : toutes les sessions arrivent depuis les serveurs d'Africa's Talking (filtrés par IP)
  skip: (req) => skip() || req.path === '/ussd',
  message: msg('RATE_LIMIT_API', 'Trop de requêtes — réessayez dans quelques minutes'),
});

/** Messages vocaux : 30 par 10 min et par utilisateur (protège le service d'IA vocale) */
const vocalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: parUtilisateur,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  message: msg('RATE_LIMIT_VOCAL', 'Trop de messages vocaux — patientez quelques minutes'),
});

module.exports = { authLimiter, apiLimiter, vocalLimiter };
