'use strict';
/**
 * SUPERVISION EN TEMPS RÉEL — une alerte de sécurité est :
 *   1. enregistrée (table alertes_securite, non supprimable) ;
 *   2. poussée IMMÉDIATEMENT par WebSocket (« alerte:nouvelle ») au super-administrateur et
 *      à la direction de l'hôpital concerné : bannière rouge et son dans l'application ;
 *   3. copiée sur Telegram, dans le groupe d'astreinte (TELEGRAM_ALERTES_CHAT_ID) :
 *      le téléphone sonne même application fermée.
 * Aucun nom de patient ni donnée médicale : type, hôpital, compteurs.
 */
const { pool } = require('../config/database');
const env = require('../config/env');
const { emettre } = require('./temps-reel.service');
const { notifier } = require('./notification.service');
const telegram = require('./canaux/telegram');

const LIBELLES = {
  VOLUME_INHABITUEL: 'Volume inhabituel de dossiers ouverts',
  HORAIRE_INHABITUEL: 'Activité à une heure inhabituelle',
  REFUS_REPETES: 'Accès refusés répétés (autre hôpital ?)',
  NOUVELLE_ADRESSE_IP: 'Connexion depuis une nouvelle adresse',
  COMPTE_VERROUILLE: 'Compte verrouillé : 5 mots de passe faux',
  JOURNAL_ALTERE: 'Journal d’audit modifié : chaîne rompue',
};

/** Destinataires : super-administrateurs + direction de l'hôpital concerné (sauf la personne en cause). */
async function destinataires(db, structureId, userId) {
  const { rows } = await db.query(
    `SELECT u.id FROM users u WHERE u.role_global = 'SUPER_ADMIN' AND u.is_active
     UNION SELECT m.user_id FROM membres_structure m
      WHERE $1::uuid IS NOT NULL AND m.structure_id = $1 AND m.role = 'ADMIN_STRUCTURE' AND m.statut = 'ACTIF'
        AND m.user_id IS DISTINCT FROM $2::uuid`, [structureId || null, userId || null]);
  return rows.map((r) => r.id);
}

/**
 * Crée et diffuse une alerte. `db` : client déjà ouvert (sinon le pool, rôle propriétaire non requis :
 * la politique d'insertion des alertes est ouverte, la lecture reste réservée).
 */
async function lever({ type, userId = null, structureId = null, score = 1, details = {} }, db = pool) {
  const { rows: [a] } = await db.query(
    'SELECT * FROM alerte_creer($1, $2, $3, $4, $5)',
    [userId, structureId, type, score, details]);
  const { rows: [st] } = structureId
    ? await db.query('SELECT COALESCE(sigle, nom) AS nom FROM structures WHERE id = $1', [structureId])
    : { rows: [] };
  const charge = { ...a, libelle: LIBELLES[type] || type, structure: st?.nom || null };
  const dest = await destinataires(db, structureId, userId);
  for (const id of dest) {
    emettre(id, 'alerte:nouvelle', charge);
    await notifier(db, id, { type: 'ALERTE_SECURITE', titre: charge.libelle, corps: 'À vérifier dans la supervision.', data: { alerte_id: a.id } })
      .catch(() => {});
  }
  if (env.telegram?.alertesChatId && telegram.configure()) {
    const heure = new Date(a.created_at).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Dakar', hour: '2-digit', minute: '2-digit' });
    telegram.envoyer(env.telegram.alertesChatId,
      `🚨 SAMA XHEL — ${charge.libelle}\nHôpital : ${charge.structure || 'plateforme'}\nScore : ${a.score} · ${heure}\nÀ traiter dans la supervision.`)
      .catch((e) => console.error('[Alertes] Telegram :', e.message));
  }
  return charge;
}

module.exports = { lever, LIBELLES };
