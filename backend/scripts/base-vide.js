'use strict';
// Affiche « oui » si la base ne contient encore aucun compte (premier démarrage en ligne)
const { Client } = require('pg');
require('dotenv').config({ quiet: true });
const c = new Client({
  host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
  user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined, // TLS vérifié (anti-MITM)
});
c.connect()
  .then(() => c.query('SELECT count(*)::int AS n FROM users'))
  .then((r) => { console.log(r.rows[0].n === 0 ? 'oui' : 'non'); return c.end(); })
  .catch(() => { console.log('oui'); process.exit(0); });
