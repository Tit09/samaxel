'use strict';
const { Pool } = require('pg');
const env = require('./env');

/**
 * Pool de connexions avec le rôle APPLICATIF (pas le propriétaire des tables)
 * → la Row Level Security de PostgreSQL s'applique à toutes les requêtes.
 */
const pool = new Pool({
  ...env.db,
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Erreur inattendue PostgreSQL :', err.message);
});

/**
 * Exécute `fn(client)` dans une transaction où le contexte de sécurité
 * (utilisateur, rôle, structure) est posé pour la RLS.
 * La transaction est validée AVANT que la réponse HTTP ne parte :
 * si COMMIT échoue, le client reçoit une erreur (et non un faux succès).
 *
 * @param {{id:string, role:string, structure_id?:string|null}|null} user
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
async function withContext(user, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.user_id', $1, true),
              set_config('app.role', $2, true),
              set_config('app.structure_id', $3, true)`,
      [user?.id || '', user?.role || '', user?.structure_id || ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Raccourci : withContext avec l'utilisateur de la requête */
const ctx = (req, fn) => withContext(req.user, fn);

module.exports = { pool, withContext, ctx };
