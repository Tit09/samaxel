'use strict';
/**
 * Photos des structures choisies pour le site (liens publics vérifiés le 26/10/2026), avec leur source.
 * ⚠ Photos de presse ou de sites tiers : à REMPLACER par des photos fournies par chaque structure
 *   (avec son autorisation écrite) avant une mise en ligne publique. Les liens morts ou trompeurs
 *   (photo d'un autre hôpital, photo d'illustration) ont été retirés.
 * Sans photo, le site et l'application affichent une mini-carte OpenStreetMap du lieu réel.
 */
const PHOTOS = {
  'Clinique psychiatrique Moussa Diop': ['https://actualite.nouvelle-aquitaine.science/wp-content/uploads/2019/03/eugenie-baccotdscf6087hopital-de-fann-service-de-psychiatrie-1024x683.jpg', 'Eugénie Baccot / actualite.nouvelle-aquitaine.science'],
  'Centre de Prise en charge Intégrée des Addictions de Dakar': ['https://www.unaids.org/sites/default/files/styles/large/public/1012e421-40c6-4af0-88d4-101d90eacad2.JPG?itok=RfFt7AVh', 'ONUSIDA (unaids.org)'],
  'Hôpital Principal de Dakar — Service de psychiatrie': ['https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/H%C3%B4pital_Principal_de_Dakar.jpg/960px-H%C3%B4pital_Principal_de_Dakar.jpg', 'Benj90, CC BY-SA 4.0, Wikimedia Commons'],
  'Hôpital régional de Thiès — Service de psychiatrie': ['https://www.enqueteplus.com/sites/default/files/styles/article-default/public/main/articles/hopital-thies_3.jpg?itok=_3oW1ehG', 'EnQuête+ (enqueteplus.com)'],
  'Centre hospitalier régional de Richard-Toll': ['https://i0.wp.com/baobab7.com/wp-content/uploads/2019/11/IMG-20191125-WA0007.jpg?fit=871%2C540&ssl=1', 'baobab7.com'],
  'Hôpital Matlaboul Fawzeini de Touba': ['https://www.dakaractu.com/photo/art/grande/50011564-38722737.jpg?v=1600796597', 'Dakaractu'],
  'Hôpital régional Amadou Sakhir Mbaye de Louga': ['https://www.dakaractu.com/photo/art/default/63904846-45971603.jpg?v=1650468117', 'Dakaractu'],
  'Hôpital régional de Ziguinchor': ['https://lesoleil.sn/wp-content/uploads/2025/04/Photo-hopital-regional-de-Ziguinchor-copie.webp', 'Le Soleil (lesoleil.sn)'],
};

async function appliquerPhotos(db) {
  let n = 0;
  for (const [nom, [url, credit]] of Object.entries(PHOTOS)) {
    const r = await db.query('UPDATE structures SET photo_url = $1, photo_credit = $2 WHERE nom = $3', [url, credit, nom]);
    n += r.rowCount;
  }
  return n;
}

module.exports = { appliquerPhotos, PHOTOS };

if (require.main === module) {
  const path = require('path');
  const { Client } = require('pg');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const db = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_ADMIN_USER, password: process.env.DB_ADMIN_PASSWORD });
  db.connect().then(() => appliquerPhotos(db)).then((n) => { console.log(`[Photos] ${n} structure(s) illustrée(s)`); return db.end(); });
}
