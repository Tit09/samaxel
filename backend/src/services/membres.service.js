'use strict';
const { notifier } = require('./notification.service');

/** Identifiants des membres actifs d'une structure, filtrés par rôle */
async function membresActifs(db, structureId, roles = ['MEDECIN', 'THERAPEUTE', 'SECRETAIRE', 'ADMIN_STRUCTURE']) {
  const { rows } = await db.query(
    `SELECT user_id FROM membres_structure
     WHERE structure_id = $1 AND statut = 'ACTIF' AND role = ANY($2)`,
    [structureId, roles],
  );
  return rows.map((r) => r.user_id);
}

/** Notifie tous les membres concernés d'une structure (sans donnée médicale) */
async function notifierStructure(db, structureId, roles, notif) {
  const ids = await membresActifs(db, structureId, roles);
  for (const id of ids) await notifier(db, id, notif);
  return ids.length;
}

module.exports = { membresActifs, notifierStructure };
