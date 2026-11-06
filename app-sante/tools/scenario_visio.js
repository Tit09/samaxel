// Téléconsultation réelle sur LiveKit Cloud : le médecin et le parent rejoignent la même salle
// (caméra et micro simulés par Chromium) et chacun doit recevoir la vidéo de l'autre.
const { chromium } = require('playwright');
const { session } = require('./outils');
const ID = process.argv[2];
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const b = await chromium.launch({ proxy, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const med = await session(b, 'medecin', 900, 'visio_medecin');
  const par = await session(b, 'parent', 412, 'visio_parent');
  await med.aller('/visio/' + ID, 1000);
  await par.aller('/visio/' + ID, 1000);
  const etat = async (t) => t.p.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({ l: v.videoWidth, h: v.videoHeight, pret: v.readyState })));
  for (let i = 0; i < 12; i++) {
    await med.p.waitForTimeout(2500);
    const m = await etat(med), p = await etat(par);
    console.log(`t=${(i + 1) * 2.5}s médecin: ${JSON.stringify(m)}  parent: ${JSON.stringify(p)}`);
    if (m.filter((v) => v.l > 0).length >= 2 && p.filter((v) => v.l > 0).length >= 2) break;
  }
  await med.shot('visio'); await par.shot('visio');
  console.log('erreurs', med.erreurs.slice(0, 6), par.erreurs.slice(0, 6));
  await b.close();
})();
