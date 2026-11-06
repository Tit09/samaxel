// Capture de l'examen d'une candidature par l'admin de structure.
const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch();
  const adm = await session(b, 'admin', 412, 'n_admin');
  await adm.aller('/pro/admin', 3500); await adm.shot('equipe');
  await adm.clicTexte('Examiner la candidature', 3000); await adm.shot('candidature');
  await adm.p.mouse.wheel(0, 900); await adm.shot('candidature_bas');
  console.log(adm.erreurs.slice(0, 5).join('\n') || 'ok');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
