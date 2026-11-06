'use strict';
/**
 * Notifications : enregistrées en base (visibles dans l'app) + push Firebase
 * Cloud Messaging si FCM_SERVICE_ACCOUNT_JSON est configuré.
 * Le contenu push ne contient JAMAIS de donnée de santé (juste « Nouveau message »).
 */
const env = require('../config/env');

let messaging = null;
function fcm() {
  if (messaging !== null) return messaging;
  messaging = false;
  if (!env.fcmServiceAccount) return messaging;
  try {
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env.fcmServiceAccount)) });
    messaging = admin.messaging();
  } catch (err) {
    console.error('[Push] FCM indisponible :', err.message);
  }
  return messaging;
}

/**
 * @param {import('pg').PoolClient} db client dans un contexte (withContext)
 */
async function notifier(db, userId, { type, titre, corps, data = {} }) {
  await db.query(
    'INSERT INTO notifications (user_id, type, titre, corps, data) VALUES ($1, $2, $3, $4, $5)',
    [userId, type, titre, corps, data],
  );
  const m = fcm();
  if (!m) return;
  const { rows } = await db.query('SELECT token FROM jetons_push($1)', [userId]);
  if (!rows.length) return;
  const stringData = Object.fromEntries(Object.entries({ type, ...data }).map(([k, v]) => [k, String(v)]));
  m.sendEachForMulticast({
    tokens: rows.map((r) => r.token),
    notification: { title: titre, body: corps },
    data: stringData,
  }).catch((err) => console.error('[Push] Envoi échoué :', err.message));
}

module.exports = { notifier };
