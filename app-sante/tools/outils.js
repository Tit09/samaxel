// Outils communs aux parcours Playwright (Flutter web expose l'arbre d'accessibilité).
const fs = require('fs');
const OUT = '/home/claude/captures';
const URL = 'http://localhost:8080/';
const comptes = { super: 'admin@samaxhel.sn', parent: 'parent@samaxhel.sn', medecin: 'medecin@samaxhel.sn', secretaire: 'secretaire@samaxhel.sn', admin: 'admin.kx@samaxhel.sn', therapeute: 'therapeute@samaxhel.sn' };

async function session(navigateur, role, W = 412, prefixe = role) {
  const ctx = await navigateur.newContext({ geolocation: { latitude: 14.6937, longitude: -17.4441 }, permissions: ['geolocation', 'camera', 'microphone'],
    viewport: { width: W, height: W > 800 ? 900 : 860 }, deviceScaleFactor: W > 800 ? 1 : 2,
    // Vidéo de démonstration : VIDEO_DIR=dossier node tools/demo_app.js
    ...(process.env.VIDEO_DIR ? { recordVideo: { dir: `${process.env.VIDEO_DIR}/${prefixe}`, size: { width: W, height: W > 800 ? 900 : 860 } } } : {}) });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('console', (m) => { if (m.type() === 'error' || /\[Visio\]/.test(m.text())) erreurs.push(m.text()); });
  p.on('pageerror', (e) => erreurs.push(e.message));
  p.on('response', async (r) => { if (r.status() >= 400 && r.url().includes(':3001')) erreurs.push(r.status() + ' ' + r.request().method() + ' ' + r.url().replace('http://localhost:3001', '') + ' ' + (await r.text().catch(() => '')).slice(0, 160)); });
  let n = 0;
  const shot = async (nom) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${prefixe}_${W}_${String(++n).padStart(2, '0')}_${nom}.png` }); };
  const semantique = async () => { await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(400); };
  const clic = async (nom, opts = {}) => {
    await semantique();
    const loc = p.getByRole(opts.role || 'button', { name: nom, exact: !!opts.exact }).first();
    await loc.waitFor({ timeout: 15000 }); await loc.click(); await p.waitForTimeout(opts.attente || 1500);
  };
  const echap = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clicTexte = async (texte, attente = 1500) => {
    await semantique();
    const re = new RegExp(echap(texte));
    const cands = [p.getByRole('button', { name: re }), p.getByRole('checkbox', { name: re }), p.getByRole('radio', { name: re }),
      p.getByRole('tab', { name: re }), p.getByRole('link', { name: re }), p.getByRole('menuitem', { name: re }), p.getByRole('option', { name: re }), p.getByText(re)];
    for (let essai = 0; essai < 20; essai++) {
      for (const c of cands) { if (await c.count()) { await c.first().click(); await p.waitForTimeout(attente); return; } }
      await p.waitForTimeout(500); await semantique();
    }
    throw new Error('Introuvable : ' + texte);
  };
  const saisir = async (nom, valeur) => {
    await semantique();
    const loc = p.getByRole('textbox', { name: nom }).first();
    await loc.waitFor({ timeout: 15000 }); await loc.click(); await p.waitForTimeout(300); await loc.fill(''); await p.keyboard.type(valeur, { delay: 20 }); await p.waitForTimeout(300);
  };
  const aller = async (route, attente = 3000) => { await p.goto(URL + '#' + route); await p.waitForTimeout(attente); };
  const t = { p, shot, clic, clicTexte, saisir, semantique, aller, erreurs };

  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(5000);
  await clic('J’ai déjà un compte');
  await saisir('Téléphone ou e-mail', comptes[role]);
  await saisir('Mot de passe', 'Demo@2026sx');
  await shot('connexion');
  await clic('Se connecter', { attente: 3000 });
  if (role !== 'parent') {
    await p.waitForTimeout(1500);
    const log = fs.readFileSync('/home/claude/backend.log', 'utf8');
    const codes = [...log.matchAll(/\[OTP:mfa\][^\n]*(?:→|->) (\d{6})/g)].map((m) => m[1]);
    await shot('mfa'); await semantique();
    const champ = p.getByRole('textbox').first();
    await champ.click(); await p.keyboard.type(codes[codes.length - 1]); await p.waitForTimeout(2500);
    if (await p.getByRole('button', { name: 'Valider' }).count()) { await p.getByRole('button', { name: 'Valider' }).first().click().catch(() => {}); await p.waitForTimeout(3000); }
  }
  await shot('accueil');
  return t;
}
module.exports = { session };
