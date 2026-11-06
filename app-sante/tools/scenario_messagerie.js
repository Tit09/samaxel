// Messagerie privée parent ↔ soignant, de bout en bout dans de vrais navigateurs :
//  1. le parent écrit et envoie un message VOCAL depuis son téléphone ;
//  2. le médecin lit et écoute sur son ordinateur ;
//  3. le parent se connecte sur un AUTRE appareil : il relit tout (clé restaurée par le mot de passe) ;
//  4. le médecin appelle en vidéo puis en audio, le parent décroche.
//   node tools/scenario_messagerie.js
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:3001';
const MDP = 'Demo@2026sx';
const OUT = process.env.OUT || '/home/claude/captures/messagerie';
fs.mkdirSync(OUT, { recursive: true });
const journal = () => fs.readFileSync('/home/claude/backend.log', 'utf8');
const nbOtp = () => (journal().match(/\[OTP:mfa\]/g) || []).length;
const codeOtp = () => { const m = [...journal().matchAll(/\[OTP:mfa\][^\n]*(?:→|->) (\d{6})/g)]; return m[m.length - 1][1]; };
const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { brut: t }; } };

async function contexte(b, nom, taille) {
  const ctx = await b.newContext({ viewport: taille, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  p.on('response', async (r) => { if (r.status() >= 400 && r.url().includes('/api/')) erreurs.push(`${r.status()} ${r.url().replace(BASE, '')} ${(await r.text().catch(() => '')).slice(0, 120)}`); });
  let n = 0;
  const t = {
    p, ctx, erreurs,
    pause: (ms = 1200) => p.waitForTimeout(ms),
    shot: async (quoi) => { await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${nom}_${String(++n).padStart(2, '0')}_${quoi}.png` }); },
    sem: async () => { await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(250); },
    aller: async (r, w = 3500) => { await p.goto(`${BASE}/app/#${r}`); await p.waitForTimeout(w); },
    clic: async (nom, w = 1500) => { await t.sem(); const l = p.getByRole('button', { name: nom }).first(); await l.waitFor({ timeout: 20000 }); await l.click(); await p.waitForTimeout(w); },
    texte: async (re, w = 1500) => { await t.sem(); const l = p.getByText(re).first(); await l.waitFor({ timeout: 20000 }); await l.click(); await p.waitForTimeout(w); },
    saisir: async (nom, v) => {
      await t.sem();
      let l = p.getByRole('textbox', { name: nom, exact: true }).first();
      if (!(await l.count())) l = p.getByRole('textbox', { name: nom }).first();
      await l.waitFor({ timeout: 20000 }); await l.click(); await p.waitForTimeout(500);
      await p.keyboard.type(v, { delay: 30 });
    },
    videos: () => p.evaluate(() => [...document.querySelectorAll('video')].map((v) => `${v.videoWidth}x${v.videoHeight}`)),
  };
  return t;
}

async function connexion(t, email, portail) {
  await t.aller(portail ? `/connexion?portail=${portail}&espace=personnel` : '/connexion', 3500);
  await t.saisir('Téléphone ou e-mail', email);
  await t.saisir('Mot de passe', MDP);
  const avant = nbOtp();
  await t.clic('Se connecter', 1500);
  if (portail) {
    for (let i = 0; i < 40 && nbOtp() === avant; i++) await t.pause(250);
    await t.pause(2000); await t.sem();
    await t.p.getByRole('textbox').first().click();
    await t.p.keyboard.type(codeOtp(), { delay: 60 });
  }
  await t.pause(5000);
}

(async () => {
  // Préparation par l'API : la conversation entre la famille et son médecin de Keur Xaleyi
  const lp = await json(await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'parent@samaxhel.sn', password: MDP }) }));
  const hp = { 'content-type': 'application/json', authorization: `Bearer ${lp.token}` };
  const kx = (await json(await fetch(`${BASE}/api/portails/keur-xaleyi`))).etablissement;
  // Médecin de Keur Xaleyi qui suit la famille (base de développement)
  const env = Object.fromEntries(fs.readFileSync('/home/claude/sama-xhel/backend/.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]));
  const [id, prenom, nom] = require('child_process').execSync(
    `psql -h /tmp -p 5433 -U ${env.DB_ADMIN_USER} -d samaxhel -Atc "select id, prenom, nom from users where email='medecin@samaxhel.sn'"`,
    { env: { ...process.env, PGPASSWORD: env.DB_ADMIN_PASSWORD } }).toString().trim().split('|');
  const medecin = { id, prenom, nom };
  const conv = await json(await fetch(`${BASE}/api/conversations`, { method: 'POST', headers: hp, body: JSON.stringify({ professionnel_id: medecin?.id, structure_id: kx.id }) }));
  console.log('conversation', conv.conversation?.id || conv, 'médecin', medecin?.prenom, medecin?.nom);
  const nomMedecin = new RegExp(medecin.nom);

  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const tel = { width: 412, height: 860 };

  // 1. Téléphone du parent : texte + message vocal
  const p1 = await contexte(b, '1_parent_telephone', tel);
  await connexion(p1, 'parent@samaxhel.sn');
  await p1.aller('/messages', 4000);
  await p1.texte(nomMedecin, 4000);
  await p1.saisir('Votre message…', 'Bonjour docteur, mon enfant dort mal depuis une semaine.');
  await p1.clic('Envoyer', 2500);
  await p1.clic('Message vocal', 1500);
  await p1.clic('Appuyez, parlez, appuyez pour envoyer', 4500);
  await p1.shot('enregistrement');
  await p1.clic('Envoyer le message vocal', 4000);
  await p1.shot('conversation');

  // 2. Ordinateur du médecin
  const d = await contexte(b, '2_medecin_ordinateur', { width: 1280, height: 800 });
  await connexion(d, 'medecin@samaxhel.sn', 'keur-xaleyi');
  await d.aller('/pro/messages', 4000);
  await d.texte(/Aminata|Diallo/, 4000);
  await d.shot('conversation');
  const lecture = d.p.getByRole('button', { name: 'Écouter' });
  console.log('lecteurs vocaux chez le médecin :', await lecture.count());

  // 3. Le parent sur un NOUVEL appareil (aucune clé locale) : tout doit rester lisible
  const p2 = await contexte(b, '3_parent_nouvel_appareil', tel);
  await connexion(p2, 'parent@samaxhel.sn');
  await p2.aller('/messages', 4000);
  await p2.texte(nomMedecin, 5000);
  await p2.shot('conversation');
  await p2.sem();
  const illisible = await p2.p.getByText(/illisible/).count();
  const lisible = await p2.p.getByText(/dort mal/).count();
  console.log(`nouvel appareil : message lisible=${lisible} illisibles=${illisible}`);

  // 4. Appel vidéo du médecin → le parent décroche
  await d.clic('Appel vidéo', 3000);
  await d.shot('ca_sonne');
  await p2.pause(2000);
  await p2.shot('appel_entrant');
  await p2.clic('Décrocher', 6000);
  for (let i = 0; i < 8; i++) {
    const a = await d.videos(); const c = await p2.videos();
    console.log(`vidéo t=${i * 2}s médecin ${a} | parent ${c}`);
    if (a.filter((x) => x !== '0x0').length >= 2 && c.filter((x) => x !== '0x0').length >= 2) break;
    await d.pause(2000);
  }
  await d.shot('visio'); await p2.shot('visio');
  await p2.clic('Raccrocher', 1000).catch(async () => { await p2.p.keyboard.press('Escape'); });
  await d.pause(4000);

  // 5. Appel audio du parent → le médecin décroche
  await p2.aller('/messages', 3000);
  await p2.texte(nomMedecin, 4000);
  await p2.clic('Appel audio', 3000);
  await d.pause(1500); await d.shot('appel_audio_entrant');
  await d.clic('Décrocher', 6000);
  await p2.shot('appel_audio'); await d.shot('appel_audio');

  for (const t of [p1, d, p2]) if (t.erreurs.length) console.log('erreurs', t.erreurs.slice(0, 5));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
