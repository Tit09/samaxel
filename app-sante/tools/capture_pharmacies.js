const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch();
  const par = await session(b, 'parent', 412, 'n_pharma');
  await par.aller('/ordonnances', 3500);
  await par.clicTexte('Trouver une pharmacie', 9000); await par.shot('pharmacies');
  await par.p.mouse.wheel(0, 700); await par.shot('pharmacies_bas');
  console.log(par.erreurs.slice(0, 5).join('\n') || 'ok'); await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
