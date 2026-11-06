'use strict';
/**
 * Applique les migrations SQL (db/migrations/*.sql) dans l'ordre.
 *
 *  • Se connecte avec le compte ADMINISTRATEUR (DB_ADMIN_USER), propriétaire des tables.
 *  • Crée le rôle applicatif (APP_DB_USER) s'il n'existe pas, et lui donne
 *    uniquement les droits nécessaires (pas de DROP, pas d'ALTER, audit non modifiable).
 *  • Mémorise les migrations déjà appliquées dans la table schema_migrations.
 *
 * Usage : npm run migrate
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const admin = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER,
    password: process.env.DB_ADMIN_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await admin.connect();

  const appUser = process.env.APP_DB_USER;
  const appPass = process.env.APP_DB_PASSWORD;
  if (!appUser || !appPass) throw new Error('APP_DB_USER et APP_DB_PASSWORD sont obligatoires');
  if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) throw new Error('APP_DB_USER : lettres minuscules, chiffres et _ uniquement');

  // 1. Rôle applicatif (sans superutilisateur, sans BYPASSRLS)
  const { rowCount } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
  const pass = appPass.replace(/'/g, "''");
  if (rowCount === 0) {
    await admin.query(`CREATE ROLE ${appUser} LOGIN PASSWORD '${pass}' NOSUPERUSER NOBYPASSRLS`);
    console.log(`[Migrate] Rôle applicatif « ${appUser} » créé`);
  } else {
    await admin.query(`ALTER ROLE ${appUser} PASSWORD '${pass}' NOSUPERUSER NOBYPASSRLS`);
  }

  // 2. Migrations
  await admin.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nom text PRIMARY KEY, appliquee_le timestamptz NOT NULL DEFAULT NOW())`);
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const fichiers = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const f of fichiers) {
    const deja = await admin.query('SELECT 1 FROM schema_migrations WHERE nom = $1', [f]);
    if (deja.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await admin.query('BEGIN');
      await admin.query(sql);
      await admin.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [f]);
      await admin.query('COMMIT');
      console.log(`[Migrate] ✔ ${f}`);
    } catch (err) {
      await admin.query('ROLLBACK');
      throw new Error(`${f} : ${err.message}`);
    }
  }

  // 3. Droits du rôle applicatif (idempotent)
  await admin.query(`
    GRANT USAGE ON SCHEMA public TO ${appUser};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appUser};
    REVOKE UPDATE, DELETE ON audit_logs FROM ${appUser};
    REVOKE UPDATE, DELETE ON messages FROM ${appUser};
    GRANT UPDATE (lu_at) ON messages TO ${appUser};
    REVOKE UPDATE, DELETE ON vocaux FROM ${appUser};
    REVOKE UPDATE, DELETE ON envois FROM ${appUser};
    GRANT UPDATE (lu_at) ON vocaux TO ${appUser};
    REVOKE ALL ON schema_migrations FROM ${appUser};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appUser};
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${appUser};
  `);
  console.log('[Migrate] Droits du rôle applicatif à jour');
  await admin.end();
}

main().catch((err) => {
  console.error('[Migrate] Échec :', err.message);
  process.exit(1);
});
