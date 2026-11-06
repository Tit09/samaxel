'use strict';
const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/database');
const redis = require('./config/redis');
const rappels = require('./services/rappels.service');

const server = app.listen(env.port, async () => {
  console.log(`[Serveur] SAMA XHEL Santé démarré sur le port ${env.port} (${env.nodeEnv})`);
  try {
    const { rows } = await pool.query('SELECT current_user, NOW()');
    console.log(`[DB] PostgreSQL connecté en tant que « ${rows[0].current_user} »`);
    const { rows: [r] } = await pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    if (r.rolsuper || r.rolbypassrls) {
      console.warn('[DB] ⚠ Le rôle de connexion contourne la RLS ! Utilisez APP_DB_USER (rôle applicatif).');
    }
  } catch (err) {
    console.error('[DB] Erreur PostgreSQL :', err.message);
  }
  require('./services/canaux/telegram').demarrerPolling(); // Telegram : codes et rappels gratuits
  rappels.demarrer(); // rappels automatiques (rendez-vous, patients urgents en attente, vocaux non écoutés)
});

async function arreter(signal) {
  console.log(`\n[Serveur] ${signal} reçu, arrêt propre…`);
  server.close(async () => {
    await pool.end().catch(() => {});
    await redis.quit().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
// Temps réel : messagerie instantanée et signalisation WebRTC de la visio
require('./services/temps-reel.service').attacher(server);

process.on('SIGINT', () => arreter('SIGINT'));
process.on('SIGTERM', () => arreter('SIGTERM'));
