// Usage : node tools/parcours.js <parent|medecin|secretaire|admin> [largeur]
const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const role = process.argv[2] || 'parent'; const W = +(process.argv[3] || 412);
  const b = await chromium.launch();
  const t = await session(b, role, W);
  try { await require(`./parcours_${role}.js`)(t); } catch (e) { console.log('ÉCHEC ÉTAPE :', e.message.split('\n')[0]); await t.shot('echec'); }
  console.log('Erreurs console :', t.erreurs.length ? t.erreurs.slice(0, 8) : 'aucune');
  await b.close();
})();
