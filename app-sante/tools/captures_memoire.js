// Captures du mémoire (site vitrine + application), prises sur les applications en fonctionnement.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3001';
const MDP = 'Demo@2026sx';
const OUT = '/home/claude/memoire/captures/v2';
const journal = () => fs.readFileSync('/home/claude/backend.log', 'utf8');
const nbOtp = () => (journal().match(/\[OTP:mfa\]/g) || []).length;
const codeOtp = () => { const m = [...journal().matchAll(/\[OTP:mfa\][^\n]*(?:→|->) (\d{6})/g)]; return m[m.length - 1][1]; };
async function ctx(b, taille) {
  const c = await b.newContext({ viewport: taille, deviceScaleFactor: 1.5, permissions: ['geolocation'], geolocation: { latitude: 14.6937, longitude: -17.4441 } });
  const p = await c.newPage();
  const t = {
    p, pause: (ms = 1200) => p.waitForTimeout(ms),
    shot: async (nom) => { await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${nom}.png` }); console.log('✔', nom); },
    sem: async () => { await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(250); },
    aller: async (r, w = 4000) => { await p.goto(`${BASE}/app/#${r}`); await p.waitForTimeout(w); },
    clic: async (nom, w = 1500) => { await t.sem(); const l = p.getByRole('button', { name: nom }).first(); await l.waitFor({ timeout: 20000 }); await l.click(); await p.waitForTimeout(w); },
    saisir: async (nom, v) => { await t.sem(); let l = p.getByRole('textbox', { name: nom, exact: true }).first(); if (!(await l.count())) l = p.getByRole('textbox', { name: nom }).first(); await l.waitFor({ timeout: 20000 }); await l.click(); await p.waitForTimeout(400); await p.keyboard.type(v, { delay: 25 }); },
  };
  return t;
}
async function connexion(t, email, portail) {
  await t.aller(portail ? `/connexion?portail=${portail}&espace=personnel` : '/connexion', 3500);
  await t.saisir('Téléphone ou e-mail', email); await t.saisir('Mot de passe', MDP);
  const avant = nbOtp(); await t.clic('Se connecter', 1500);
  if (portail) { for (let i = 0; i < 40 && nbOtp() === avant; i++) await t.pause(250); await t.pause(2000); await t.sem(); await t.p.getByRole('textbox').first().click(); await t.p.keyboard.type(codeOtp(), { delay: 60 }); }
  await t.pause(5000);
}
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pc = { width: 1366, height: 800 }; const tel = { width: 412, height: 860 };
  // Site vitrine
  const s = await ctx(b, pc);
  await s.p.goto(BASE + '/'); await s.shot('site_accueil');
  await s.p.goto(BASE + '/etablissement/cepiad'); await s.pause(2500); await s.shot('site_portail_cepiad');
  await s.p.evaluate(() => window.scrollTo(0, 900)); await s.shot('site_portail_tarifs');
  await s.p.goto(BASE + '/etablissement/cepiad/file'); await s.pause(2500); await s.shot('site_ecran_file');
  const sm = await ctx(b, tel); await sm.p.goto(BASE + '/'); await sm.shot('site_mobile');
  // Application : accueil public
  const a = await ctx(b, tel); await a.aller('/bienvenue', 6000); await a.shot('app_bienvenue');
  // Famille
  const f = await ctx(b, tel); await connexion(f, 'parent@samaxhel.sn'); await f.aller('/accueil', 4000); await f.shot('app_famille_accueil');
  await f.aller('/maison/cepiad', 5000); await f.shot('app_famille_maison_cepiad');
  const fd = await ctx(b, pc); await connexion(fd, 'parent@samaxhel.sn'); await fd.aller('/accueil', 4000); await fd.shot('app_famille_accueil_ordinateur');
  // Personnel CEPIAD
  const m = await ctx(b, pc); await connexion(m, 'medecin@cepiad.samaxhel.sn', 'cepiad'); await m.aller('/pro/accueil', 4000); await m.shot('app_medecin_accueil');
  await m.aller('/pro/dossiers', 4000); await m.shot('app_medecin_dossiers');
  const c = await ctx(b, pc); await connexion(c, 'accueil@cepiad.samaxhel.sn', 'cepiad'); await c.aller('/pro/caisse', 5000); await c.shot('app_caisse');
  const d = await ctx(b, pc); await connexion(d, 'direction@cepiad.samaxhel.sn', 'cepiad'); await d.aller('/pro/admin', 5000); await d.shot('app_direction');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
