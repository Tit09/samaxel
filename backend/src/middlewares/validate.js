'use strict';
const { badRequest } = require('../utils/errors');

/**
 * Valide req.body / req.query / req.params avec un schéma zod.
 * Les données validées (et nettoyées) remplacent les originales.
 */
const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        champ: i.path.join('.'),
        message: i.message,
      }));
      throw badRequest(
        `Données invalides : ${details.map((d) => `${d.champ || part} (${d.message})`).join(', ')}`,
        'VALIDATION_ERROR',
        details,
      );
    }
    // Express 5 : req.query est en lecture seule → on stocke la version validée à part
    if (part === 'query') req.validQuery = result.data;
    else req[part] = result.data;
  }
  next();
};

module.exports = { validate };
