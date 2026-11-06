'use strict';
const { HttpError } = require('../utils/errors');
const env = require('../config/env');

/** 404 pour les routes inconnues */
function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.path}`, code: 'ROUTE_NOT_FOUND' });
}

/**
 * Gestion centralisée des erreurs. Format TOUJOURS identique :
 *   { "error": "message lisible en français", "code": "CODE_STABLE", "details"?: [...] }
 * Les erreurs internes ne révèlent jamais de détail technique au client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}),
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide', code: 'INVALID_JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Requête trop volumineuse', code: 'PAYLOAD_TOO_LARGE' });
  }
  // Erreurs PostgreSQL connues
  if (err.code === '22P02') return res.status(400).json({ error: 'Identifiant invalide', code: 'INVALID_ID' });
  if (err.code === '23505') return res.status(409).json({ error: 'Cet élément existe déjà', code: 'DUPLICATE' });
  if (err.code === '23503') return res.status(400).json({ error: 'Référence inexistante', code: 'INVALID_REFERENCE' });
  if (err.code === '42501') return res.status(403).json({ error: 'Accès refusé', code: 'FORBIDDEN' });

  if (!env.isTest || process.env.DEBUG_ERREURS) console.error(`[Erreur] ${req.method} ${req.path} :`, err);
  return res.status(500).json({ error: 'Erreur serveur', code: 'SERVER_ERROR' });
}

module.exports = { notFoundHandler, errorHandler };
