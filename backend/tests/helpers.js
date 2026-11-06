'use strict';
/**
 * Prépare une base de TEST dédiée (samaxhel_test) : création, migrations, données de démo.
 * Les tests utilisent le vrai PostgreSQL et le vrai Redis, avec le rôle applicatif
 * soumis à la RLS — exactement comme en production.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
process.env.NODE_ENV = 'test';
process.env.DB_NAME = `${process.env.DB_NAME}_test`;

let pret = false;
async function preparerBase() {
  if (pret) return;
  const admin = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), database: 'postgres',
    user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD,
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${process.env.DB_NAME}`);
  await admin.end();
  const opts = { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe' };
  execFileSync('node', ['scripts/migrate.js'], opts);
  execFileSync('node', ['scripts/seed.js'], opts);
  execFileSync('node', ['scripts/import-osm.js'], opts);
  execFileSync('node', ['scripts/import-annuaire.js'], opts);
  execFileSync('node', ['scripts/comptes-etablissements.js'], opts);
  pret = true;
}

/** Connexion administrateur (contourne la RLS) pour vérifier ce qui est réellement stocké */
async function requeteAdmin(sql, params = []) {
  const c = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD,
  });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
}

const MDP = 'Demo@2026sx';

module.exports = { preparerBase, requeteAdmin, MDP };
