'use strict';
const { pool } = require('../config/database');

/**
 * Journal d'audit : enregistre qui a accédé à quelle donnée de santé.
 * Exigé pour la traçabilité (confidentialité médicale, protection des données).
 * Usage : router.get('/:id', audit('LECTURE', 'enfant'), ctrl.get)
 */
const audit = (action, ressource) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 500) return;
    pool.query(
      `INSERT INTO audit_logs (user_id, role, structure_id, action, ressource, ressource_id, ip, statut_http)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user?.id || null,
        req.user?.role || null,
        req.user?.structure_id || null,
        action,
        ressource,
        req.params?.id || req.params?.enfant_id || null,
        req.ip,
        res.statusCode,
      ],
    ).catch((err) => console.error('[Audit] Échec écriture :', err.message));
  });
  next();
};

module.exports = { audit };
