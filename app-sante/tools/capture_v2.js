// Captures de l'application v2 : accueil diaporama, Pour qui, établissements, portails, notifications.
const { chromium } = require('playwright');
const { session } = require('./outils');
const OUT = '/home/claude/captures/v2';
(async () => {
  const b = await chromium.launch();
  // Visiteur (sans compte)
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, geolocation: { latitude: 14.6937, longitude: -17.4441 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  let n = 0;
  const shot = async (nom) => { await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}_${nom}.png` }); };
  const aller = async (r, t = 3500) => { await p.goto('http://localhost:8080/#' + r); await p.waitForTimeout(t); };
  await p.goto('http://localhost:8080/', { waitUntil: 'networkidle' }); await p.waitForTimeout(6000);
  await shot('accueil');
  await p.waitForTimeout(7500); await shot('accueil_diapo2');
  await aller('/pour-qui'); await shot('pour_qui');
  await aller('/pour-qui?pro=1'); await shot('soignant_etablissement');
  await aller('/etablissements'); await shot('etablissements');
  await aller('/etablissements?public=PERSONNE_AGEE'); await shot('etablissements_ages');
  await aller('/portail/cepiad', 4500); await shot('portail_cepiad');
  await p.mouse.move(200, 500); await p.mouse.wheel(0, 700); await shot('portail_cepiad_services');
  await aller('/portail/fann', 4500); await p.mouse.move(200, 500); await p.mouse.wheel(0, 500); await shot('portail_fann_rattaches');
  await aller('/portail/thiaroye', 4000); await shot('portail_thiaroye');
  await aller('/creer-hopital'); await shot('creer_hopital');
  await ctx.close();
  // Parent connecté
  const par = await session(b, 'parent', 412, 'v2/parent');
  await par.p.mouse.move(200, 500); await par.p.mouse.wheel(0, 900); await par.shot('accueil_etablissements');
  await par.aller('/reglages/notifications'); await par.shot('notifications');
  await par.aller('/enfant/ajouter'); await par.shot('personne_suivie');
  console.log([...erreurs, ...par.erreurs].slice(0, 8).join('\n') || 'ok');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
