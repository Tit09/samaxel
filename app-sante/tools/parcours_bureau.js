const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch();
  const med = await session(b, 'medecin', 1280, 'bureau_medecin');
  await med.aller('/pro/dossiers'); await med.shot('dossiers');
  const par = await session(b, 'parent', 1280, 'bureau_parent');
  await par.aller('/trouver'); await par.shot('trouver');
  await par.clicTexte('Carte').catch(() => {}); await par.shot('carte');
  console.log(med.erreurs.slice(0, 4), par.erreurs.slice(0, 4));
  await b.close();
})();
