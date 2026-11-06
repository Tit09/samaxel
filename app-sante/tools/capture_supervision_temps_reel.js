// Supervision en temps réel : bannière d'alerte chez le super-administrateur, puis panne vue par Uptime Kuma.
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const BASE = 'http://localhost:3001';
const OUT = process.env.OUT || '/home/claude/memoire/captures/v2';
const journal = () => fs.readFileSync('/home/claude/backend.log', 'utf8');
const nbOtp = () => (journal().match(/\[OTP:mfa\]/g) || []).length;
const codeOtp = () => { const m = [...journal().matchAll(/\[OTP:mfa\][^\n]*(?:→|->) (\d{6})/g)]; return m[m.length - 1][1]; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
  const sem = async () => { await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(250); };
  const saisir = async (nom, v) => { await sem(); const l = p.getByRole('textbox', { name: nom }).first(); await l.waitFor(); await l.click(); await p.waitForTimeout(300); await p.keyboard.type(v, { delay: 25 }); };
  await p.goto(`${BASE}/app/#/connexion`); await p.waitForTimeout(4000);
  await saisir('Téléphone ou e-mail', 'admin@samaxhel.sn'); await saisir('Mot de passe', 'Demo@2026sx');
  const avant = nbOtp(); await sem(); await p.getByRole('button', { name: 'Se connecter' }).first().click();
  for (let i = 0; i < 40 && nbOtp() === avant; i++) await p.waitForTimeout(250);
  await p.waitForTimeout(2000); await sem(); await p.getByRole('textbox').first().click(); await p.keyboard.type(codeOtp(), { delay: 60 });
  await p.waitForTimeout(6000);
  // Attaque simulée : 5 mots de passe faux sur un compte du CEPIAD
  for (let i = 0; i < 5; i++) {
    await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'accueil@cepiad.samaxhel.sn', password: 'mauvais' + i, portail: 'cepiad' }) });
  }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/supervision_alerte_temps_reel.png` });
  console.log('✔ bannière');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
