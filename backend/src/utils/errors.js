'use strict';

/** Erreur métier avec code HTTP et code stable lisible par l'application mobile */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, code = 'BAD_REQUEST', details) => new HttpError(400, code, msg, details);
const unauthorized = (msg = 'Non authentifié', code = 'UNAUTHENTICATED') => new HttpError(401, code, msg);
const forbidden = (msg = 'Accès refusé', code = 'FORBIDDEN') => new HttpError(403, code, msg);
const notFound = (msg = 'Ressource introuvable', code = 'NOT_FOUND') => new HttpError(404, code, msg);
const conflict = (msg, code = 'CONFLICT') => new HttpError(409, code, msg);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
