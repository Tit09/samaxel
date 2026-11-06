// Test du kit de démonstration locale (docker compose) : comme sur un téléphone.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const OUT = '/home/claude/captures/demo';
require('fs').mkdirSync(OUT, { recursive: true });
const otp = () => [...execSync('docker logs samaxhel-demo-api-1 2>&1', { cwd: __dirname }).toString().matchAll(/\[OTP:[a-z]+\][^\n]*(?:→|->) (\d{6})/g)].pop()[1];
(async () => {
  const b = await chromium.launch();
  const res = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, geolocation: { latitude: 14.69, longitude: -17.44 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  let n = 0; const shot = async (x) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}_${x}.png` }); };
  const sem = async () => { await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(300); };
  const clic = async (t, att = 1500) => { await sem(); const l = p.getByRole('button', { name: new RegExp(t) }).first(); await l.waitFor({ timeout: 15000 }); await l.click(); await p.waitForTimeout(att); };
  const saisir = async (nom, v) => { await sem(); const l = p.getByRole('textbox', { name: nom }).first(); await l.waitFor({ timeout: 15000 }); await l.click(); await l.fill(v); };
  const etape = async (nom, f) => { try { await f(); res.push('✔ ' + nom); } catch (e) { res.push('✘ ' + nom + ' — ' + e.message.split('\n')[0]); await shot('echec'); } };

  await p.goto('http://localhost:8080/'); await p.waitForTimeout(6000);
  await etape('accueil + bouton serveur visible', async () => { await sem(); await p.getByRole('button', { name: /Serveur de test/ }).first().waitFor({ timeout: 10000 }); await shot('accueil'); });
  await etape('mauvais serveur → message clair', async () => {
    await clic('Serveur de test'); await sem();
    const champ = p.getByRole('textbox').first(); await champ.fill('http://10.9.9.9:3001'); await clic('Tester', 7000); await shot('serveur_injoignable'); await clic('Enregistrer');
    await clic('Voir les centres', 13000); await shot('erreur_serveur');
    await sem(); await p.getByText(/ne répond pas/).first().waitFor({ timeout: 5000 });
  });
  await etape('bon serveur → test OK', async () => {
    await clic('Adresse du serveur'); await sem();
    const champ = p.getByRole('textbox').first(); await champ.fill('http://localhost:3001'); await clic('Tester', 3000); await shot('serveur_ok');
    await p.getByText(/Le serveur répond/).first().waitFor({ timeout: 5000 }); await clic('Enregistrer'); await p.goBack(); await p.waitForTimeout(1500);
  });
  await etape('centres sans compte', async () => { await clic('Voir les centres', 5000); await shot('centres_sans_compte'); await sem(); await p.getByText(/Keur Xaleyi|CEPIAD|Fann/).first().waitFor({ timeout: 8000 }); await p.goBack(); await p.waitForTimeout(1500); });
  await etape('création de compte parent', async () => {
    await clic('Wolof'); await clic('Créer mon compte parent', 2500);
    await saisir('Votre prénom', 'Awa'); await saisir('Votre nom', 'Sow'); await saisir('Numéro de téléphone', '771234567');
    await saisir('Mot de passe', 'Awa2026demo'); await shot('inscription');
    await clic('Continuer', 2500); await shot('etape2');
  });
  console.log(res.join('\n'));
  await b.close();
})();
