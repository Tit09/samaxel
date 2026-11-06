'use strict';
/**
 * Import des données OUVERTES et RÉELLES d'OpenStreetMap (export HOT / HDX « Health Facilities of Senegal »,
 * licence ODbL — attribution obligatoire « © contributeurs OpenStreetMap ») :
 *   - toutes les pharmacies nommées du Sénégal → table pharmacies ;
 *   - tous les hôpitaux / centres de santé nommés → annuaire (structures non partenaires, « non vérifiées »).
 * Idempotent : relancer le script met à jour sans créer de doublon.
 * Usage : node scripts/import-osm.js [data/osm/health_facilities.geojson]
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const fichier = process.argv[2] || path.join(__dirname, '..', 'data', 'osm', 'health_facilities.geojson');

function centre(g) {
  if (g.type === 'Point') return g.coordinates;
  const anneau = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
  const n = anneau.length;
  return [anneau.reduce((a, p) => a + p[0], 0) / n, anneau.reduce((a, p) => a + p[1], 0) / n];
}
const propre = (s) => (s ? String(s).trim().replace(/\s+/g, ' ') : null);
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

async function main() {
  const geo = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const db = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD,
  });
  await db.connect();
  let ph = 0; let st = 0;
  try {
    await db.query('BEGIN');
    for (const f of geo.features) {
      const p = f.properties;
      const nom = propre(p.name || p.name_fr);
      if (!nom || !f.geometry) continue;
      const [lng, lat] = centre(f.geometry);
      const osmId = `osm:${p.id ?? p.osm_id}`;
      if (p.amenity === 'pharmacy') {
        await db.query(
          `INSERT INTO pharmacies (osm_id, nom, region, departement, commune, adresse, latitude, longitude)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (osm_id) DO UPDATE SET nom = EXCLUDED.nom, region = EXCLUDED.region, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
          [osmId, majuscule(nom), p.adm1_name, p.adm2_name, p.adm3_name || p.addr_city, propre(p.addr_full), lat.toFixed(6), lng.toFixed(6)]);
        ph++;
      } else if (p.amenity === 'hospital') {
        const hopital = /h[oô]pital|hospitalier|\bchu\b|\bchn\b|\bchr\b|clinique/i.test(nom);
        const { rowCount } = await db.query('SELECT 1 FROM structures WHERE source = $1', [osmId]);
        if (!rowCount) {
          await db.query(
            `INSERT INTO structures (nom, type, secteur, region, departement, commune, adresse, latitude, longitude,
                                     troubles, services, partenaire, verifie, source, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}', '{}', false, false, $10,
                     'Établissement de santé référencé dans OpenStreetMap. Services TND non renseignés : appelez avant de vous déplacer.')`,
            [majuscule(nom), hopital ? 'HOPITAL' : 'CENTRE_SANTE', p.operator_type === 'private' ? 'PRIVE' : 'PUBLIC',
              p.adm1_name || 'Dakar', p.adm2_name, p.adm3_name || p.addr_city, propre(p.addr_full), lat.toFixed(6), lng.toFixed(6), osmId]);
          st++;
        }
      }
    }
    // Pharmacie FICTIVE de démonstration (aucune donnée inventée sur une vraie pharmacie)
    const { rows: [demo] } = await db.query(
      `INSERT INTO pharmacies (osm_id, nom, region, commune, adresse, latitude, longitude, telephone, partenaire, source)
       VALUES ('demo:1', 'Pharmacie de démonstration SAMA XHEL (fictive)', 'Dakar', 'Fann', 'Données de démonstration — ne pas se déplacer',
               14.689800, -17.464400, '+221000000000', true, 'Démonstration')
       ON CONFLICT (osm_id) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`);
    for (const dci of ['risperidone', 'methylphenidate', 'diazepam', 'sertraline', 'valproate de sodium']) {
      await db.query(`INSERT INTO pharmacie_stocks (pharmacie_id, dci, disponible) VALUES ($1, $2, true)
                      ON CONFLICT (pharmacie_id, dci) DO UPDATE SET mis_a_jour_le = NOW()`, [demo.id, dci]);
    }
    await db.query('COMMIT');
    console.log(`[OSM] ${ph} pharmacies, ${st} nouveaux établissements de santé importés (© contributeurs OpenStreetMap, ODbL)`);
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error('[OSM] Échec :', e.message); process.exit(1); });
