'use strict';
const { pool, ctx } = require('../config/database');
const env = require('../config/env');
const { serveursIce } = require('../services/temps-reel.service');
const { notFound, badRequest } = require('../utils/errors');

/**
 * GET /api/teleconsultation/:consultation_id/join
 * Vérifie que l'appelant PARTICIPE à la consultation (parent concerné ou clinicien de
 * l'établissement), puis renvoie la configuration WebRTC : serveurs ICE (STUN + notre TURN,
 * identifiants valables 1 h). La salle est ensuite rejointe par Socket.IO, qui refait le contrôle.
 */
async function rejoindre(req, res) {
  const c = await ctx(req, async (db) => {
    const { rows } = await db.query('SELECT * FROM acces_teleconsultation($1)', [req.params.consultation_id]);
    return rows[0];
  });
  if (!c) throw notFound('Téléconsultation introuvable');
  if (c.type !== 'TELECONSULTATION') throw badRequest('Cette consultation n’est pas une téléconsultation', 'NOT_TELECONSULTATION');
  if (['ANNULEE', 'TERMINEE'].includes(c.statut)) throw badRequest('Cette téléconsultation est terminée ou annulée', 'CONSULTATION_CLOSED');

  const { rows: [u] } = await pool.query('SELECT prenom, nom FROM users WHERE id = $1', [req.user.id]);
  res.json({
    mode: 'WEBRTC', consultation_id: c.id, structure_id: c.structure_id,
    ice: serveursIce(req.user.id), relais_turn: Boolean(env.turn.url && env.turn.secret),
    moi: `${u.prenom} ${u.nom}`,
  });
}

module.exports = { rejoindre };
