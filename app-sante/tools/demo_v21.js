// Démo des corrections (05/11) : parcours famille, établissements, personnel, super-admin.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/claude/captures/demo';
const BASE = 'http://localhost:3001/app/';
const MDP = 'Demo@2026sx';
const codeOtp = () => { const l = fs.readFileSync('/home/claude/backend.log', 'utf8'); const m = [...l.matchAll(/\[OTP:mfa\][^\n]*(?:→|->) (\d{6})/g)]; return m[m.length - 1][1]; };

async function page(b) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, geolocation: { latitude: 14.69, longitude: -17.46 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const err = []; p.on('pageerror', (e) => err.push(e.message));
  let n = 0;
  const t = {
    p, err,
    shot: async (nom) => { await p.waitForTimeout(1400); await p.screenshot({ path: `${OUT}/${t.prefixe}_${String(++n).padStart(2, '0')}_${nom}.png` }); },
    sem: async () => { await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(300); },
    aller: async (r, w = 3500) => { await p.goto(BASE + '#' + r); await p.waitForTimeout(w); },
    clic: async (nom, w = 1500) => { await t.sem(); const l = p.getByRole('button', { name: nom }).first(); await l.waitFor({ timeout: 15000 }); await l.click(); await p.waitForTimeout(w); },
    texte: async (re, w = 1500) => { await t.sem(); const l = p.getByText(re).first(); await l.waitFor({ timeout: 15000 }); await l.click(); await p.waitForTimeout(w); },
    saisir: async (nom, v) => { await t.sem(); const l = p.getByRole('textbox', { name: nom }).first(); await l.waitFor({ timeout: 15000 }); await l.click(); await p.waitForTimeout(250); await p.keyboard.type(v, { delay: 15 }); },
    prefixe: 'x',
  };
  await p.goto(BASE, { waitUntil: 'networkidle' }); await p.waitForTimeout(5000);
  return t;
}
async function connexion(t, id, portail) {
  await t.aller(portail ? `/connexion?portail=${portail}` : '/connexion', 3000);
  if (portail) await t.shot('portail_connexion');
  await t.saisir('Téléphone ou e-mail', id);
  await t.saisir('Mot de passe', MDP);
  await t.clic('Se connecter', 3000);
  if (id !== 'parent@samaxhel.sn') {
    await t.sem(); const c = t.p.getByRole('textbox').first(); await c.click(); await t.p.keyboard.type(codeOtp()); await t.p.waitForTimeout(3000);
  }
}
(async () => {
  const b = await chromium.launch();
  // 1. Famille
  const f = await page(b); f.prefixe = 'a_famille';
  await connexion(f, 'parent@samaxhel.sn');
  await f.aller('/tests'); await f.shot('tests_pour_qui');
  await f.p.mouse.move(200, 500); await f.p.mouse.wheel(0, 1600); await f.shot('tests_tous_ages');
  await f.aller('/rendez-vous'); await f.clic('Demander un rendez-vous', 2000); await f.shot('rdv_pour_qui_ou');
  await f.aller('/portail/cepiad', 4000); await f.clic('Rejoindre cet établissement', 1500); await f.shot('rejoindre_pour_qui');
  await f.aller('/communaute', 3000); await f.shot('groupe_qui_voit');
  await f.aller('/enfants', 3000); await f.shot('personnes_suivies');
  // 2. Personnel par le portail de l'établissement
  const s = await page(b); s.prefixe = 'b_cepiad';
  await connexion(s, 'direction@cepiad.samaxhel.sn', 'cepiad');
  await s.shot('accueil_etablissement');
  await s.aller('/pro/familles', 3000); await s.shot('demandes_des_familles');
  await s.aller('/pro/admin', 3000); await s.clic('Inviter', 1500); await s.shot('inviter_personnel');
  // 3. Mauvais portail
  const m = await page(b); m.prefixe = 'c_refus';
  await m.aller('/connexion?portail=cepiad', 3000);
  await m.saisir('Téléphone ou e-mail', 'direction@keur-xaleyi.samaxhel.sn'); await m.saisir('Mot de passe', MDP);
  await m.clic('Se connecter', 300); await m.shot('compte_autre_etablissement_refuse');
  // 4. Super-administrateur
  const a = await page(b); a.prefixe = 'd_super';
  await connexion(a, 'admin@samaxhel.sn');
  await a.p.mouse.move(200, 500);
  for (let i = 0; i < 6; i++) { await a.p.mouse.wheel(0, 900); await a.shot('supervision_' + i); }
  console.log([...f.err, ...s.err, ...m.err, ...a.err].slice(0, 6).join('\n') || 'ok');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
