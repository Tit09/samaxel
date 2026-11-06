// Vidéos de démonstration (Playwright) : site, application ordinateur, application mobile + visio.
//   node tools/video_demo.js site|ordinateur|mobile
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = '/home/claude/videos';
const BASE = 'http://localhost:3001';
const MDP = 'Demo@2026sx';
const codeOtp = () => {
  const l = fs.readFileSync('/home/claude/backend.log', 'utf8');
  const m = [...l.matchAll(/\[OTP:mfa\][^\n]*(?:→|->) (\d{6})/g)];
  return m[m.length - 1][1];
};

const nbOtp = () => (fs.readFileSync('/home/claude/backend.log', 'utf8').match(/\[OTP:mfa\]/g) || []).length;

async function contexte(b, nom, taille, extra = {}) {
  const ctx = await b.newContext({ viewport: taille, deviceScaleFactor: 1, recordVideo: { dir: path.join(OUT, 'brut', nom), size: taille }, ...extra });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${nom}] ${e.message}`));
  const t = {
    p, ctx,
    pause: (ms = 1200) => p.waitForTimeout(ms),
    sem: async () => { await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(250); },
    aller: async (r, w = 3500) => { await p.goto(`${BASE}/app/#${r}`); await p.waitForTimeout(w); },
    clic: async (nom, w = 1500) => { await t.sem(); const l = p.getByRole('button', { name: nom }).first(); await l.waitFor({ timeout: 20000 }); await l.click(); await p.waitForTimeout(w); },
    texte: async (re, w = 1500) => { await t.sem(); const l = p.getByText(re).first(); try { await l.waitFor({ timeout: 20000 }); } catch (e) { await p.screenshot({ path: '/tmp/claude-0/-home-claude/813802f3-0949-5ced-84e7-1cfca7535a17/scratchpad/echec.png' }); throw e; } await l.click(); await p.waitForTimeout(w); },
    saisir: async (nom, v) => {
      await t.sem();
      let l = p.getByRole('textbox', { name: nom, exact: true }).first();
      if (!(await l.count())) l = p.getByRole('textbox', { name: nom }).first();
      await l.waitFor({ timeout: 20000 }); await l.click(); await p.waitForTimeout(600);
      await p.keyboard.type(v, { delay: 45 });
    },
    defiler: async (dy, n = 1) => { await p.mouse.move(taille.width / 2, taille.height / 2); for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(700); } },
  };
  return t;
}

async function connexionPortail(t, email, portail, otp = true) {
  await t.aller(`/connexion?portail=${portail}`, 3500);
  await t.saisir('Téléphone ou e-mail', email);
  await t.saisir('Mot de passe', MDP);
  const avant = nbOtp();
  await t.clic('Se connecter', 1000);
  if (otp) {
    for (let i = 0; i < 40 && nbOtp() === avant; i++) await t.p.waitForTimeout(500);
    await t.p.waitForTimeout(2000);
    await t.sem();
    const c = t.p.getByRole('textbox').first();
    await c.click();
    await t.p.keyboard.type(codeOtp(), { delay: 80 });
    await t.p.waitForTimeout(4000);
  }
}

async function site(b) {
  const taille = { width: 1280, height: 720 };
  const t = await contexte(b, 'site', taille);
  const p = t.p;
  await p.goto(BASE, { waitUntil: 'networkidle' }); await t.pause(3500);
  await p.locator('#etablissements').scrollIntoViewIfNeeded(); await t.pause(2500);
  await p.locator('a.portail__lien[href="/etablissement/cepiad"]').click(); await t.pause(3500);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 420); await t.pause(900); }
  await p.goto(`${BASE}/etablissement/cepiad/file`); await t.pause(3500);
  await p.goto(`${BASE}/etablissement/keur-xaleyi`); await t.pause(3000);
  await p.goto(BASE, { waitUntil: 'networkidle' }); await t.pause(1500);
  await p.click('#assistant-ouvrir'); await t.pause(800);
  await p.fill('#assistant-texte', 'Comment télécharger l’application Android ?'); await p.press('#assistant-texte', 'Enter'); await t.pause(3000);
  await p.click('#assistant-fermer');
  await p.click('[data-ouvrir="dlg-iphone"]'); await t.pause(2500);
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.evaluate(() => document.getElementById('dlg-om').showModal()); await t.pause(2500);
  await p.click('#om-fait'); await t.pause(3500);
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.locator('footer').scrollIntoViewIfNeeded(); await t.pause(2500);
  await t.ctx.close();
}

// Saisie du code de sécurité (le code est lu dans le journal du serveur de démonstration)
async function codeSecurite(t, avant) {
  for (let i = 0; i < 40 && nbOtp() === avant; i++) await t.p.waitForTimeout(500);
  await t.p.waitForTimeout(2000);
  await t.sem();
  await t.p.getByRole('textbox').first().click();
  await t.p.keyboard.type(codeOtp(), { delay: 80 });
  await t.p.waitForTimeout(4000);
}

// 1. TÉLÉPHONE — une famille découvre l'application, choisit son hôpital et le rejoint
async function decouverte(b) {
  const taille = { width: 412, height: 860 };
  const f = await contexte(b, 'a1-decouverte', taille);
  await f.aller('/bienvenue', 5000);
  await f.defiler(260, 3); await f.pause(2500);
  await f.defiler(-900, 1);
  await f.clic('Je cherche des soins', 2500);
  await f.texte('Pour mon enfant', 3500);       // les établissements adaptés aux enfants, les plus proches d'abord
  await f.defiler(300, 3);
  await f.aller('/bienvenue', 4000);
  await f.defiler(260, 3);
  await f.texte('Keur Xaleyi', 4000);           // un hôpital : sa couleur, ses services
  await f.defiler(300, 2);
  await f.aller('/bienvenue', 4000);
  await f.defiler(260, 3);
  await f.texte('CEPIAD', 4000);                // un autre hôpital, une autre maison
  await f.clic(/J’ai déjà un compte/, 2500);
  await f.saisir('Téléphone ou e-mail', 'parent@samaxhel.sn');
  await f.saisir('Mot de passe', MDP);
  await f.clic('Se connecter', 6000);            // → l'application ouvre directement l'espace CEPIAD
  await f.clic(/Rejoindre CEPIAD/, 3500);
  await f.clic('Rejoindre cet établissement', 2000);
  await f.saisir('Pourquoi consultez-vous ? (facultatif)', 'Il ne dort plus');
  await f.clic('Envoyer la demande', 5000);
  await f.defiler(300, 1);
  await f.clic('Retour à l’accueil SAMA XHEL', 3500);  // l'accueil SAMA XHEL : Mes hôpitaux, tests, assistant
  await f.defiler(280, 4);
  await f.ctx.close();
}

// 2. ORDINATEUR — le personnel : chacun entre dans SON établissement
async function personnel(b) {
  const taille = { width: 1280, height: 800 };
  const a = await contexte(b, 'b1-accueil-cepiad', taille);
  await a.aller('/bienvenue', 4000);
  await a.clic('Je suis soignant ou établissement', 2500);
  await a.texte(/J’ai déjà un compte soignant/, 3000);
  await a.saisir('Téléphone ou e-mail', 'accueil@cepiad.samaxhel.sn');
  await a.saisir('Mot de passe', MDP);
  let avant = nbOtp();
  await a.clic('Se connecter', 1000);           // renvoyé automatiquement vers le portail du CEPIAD
  await codeSecurite(a, avant);
  await a.pause(2000);
  await a.texte('Demandes des familles', 2500);
  await a.clic('Accepter', 2500);
  await a.texte(/Ibrahima Diallo/, 3000);
  await a.aller('/pro/accueil', 3000);
  await a.texte('Caisse et tickets', 3000);
  await a.clic('Encaisser un ticket', 2500);
  await a.saisir('Prénom', 'Ndeye');
  await a.saisir('Nom', 'Sarr');
  await a.saisir('Téléphone (facultatif : pour le prévenir)', '771112233');
  await a.clic(/Encaisser 3 000 F/, 4000);
  await a.clic('Fermer', 2000);
  await a.ctx.close();

  // Un médecin de Keur Xaleyi : autre hôpital, autres couleurs, aucun patient du CEPIAD
  const k = await contexte(b, 'b2-medecin-keur-xaleyi', taille);
  await k.aller('/connexion?portail=keur-xaleyi&espace=personnel', 3500);
  await k.saisir('Téléphone ou e-mail', 'medecin@keur-xaleyi.samaxhel.sn');
  await k.saisir('Mot de passe', MDP);
  avant = nbOtp();
  await k.clic('Se connecter', 1000);
  await codeSecurite(k, avant);
  await k.pause(3000);
  await k.defiler(300, 2);
  await k.ctx.close();
}

// 3. ORDINATEUR — la famille entre dans l'espace CEPIAD, voit son médecin et paie son ticket ; la caisse confirme ; le médecin appelle
async function suivi(b) {
  const taille = { width: 1280, height: 800 };
  const f = await contexte(b, 'c1-famille', taille);
  await f.aller('/connexion', 3500);
  await f.saisir('Téléphone ou e-mail', 'parent@samaxhel.sn');
  await f.saisir('Mot de passe', MDP);
  await f.clic('Se connecter', 5000);
  await f.pause(1500);
  await f.texte('CEPIAD', 4000);                 // carte « Mes hôpitaux » → espace CEPIAD
  await f.defiler(300, 2);
  await f.clic('Payer un ticket', 2000);
  await f.clic('Wave', 1500);
  await f.p.bringToFront();
  await f.saisir('Référence de la transaction', 'WV-77412');
  await f.clic(/J’ai payé/, 3500);
  await f.clic('OK', 1500);
  await f.ctx.close();

  const c = await contexte(b, 'c2-caisse', taille);
  await connexionPortail(c, 'accueil@cepiad.samaxhel.sn', 'cepiad');
  await c.aller('/pro/caisse', 3500);
  await c.clic('Confirmer', 3500);
  await c.ctx.close();

  const m = await contexte(b, 'c3-medecin', taille);
  await connexionPortail(m, 'medecin@cepiad.samaxhel.sn', 'cepiad');
  await m.pause(2000);
  await m.texte('Salle d’attente', 2500);
  await m.clic(/Appeler le suivant/, 3500);
  await m.p.goto(`${BASE}/etablissement/cepiad/file`); await m.pause(4500);
  await m.ctx.close();
}

// Téléphone : la famille dans la maison CEPIAD, puis la visio avec son médecin (caméras simulées)
async function jetonPro(email, portail) {
  const avant = nbOtp();
  const r1 = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: email, password: MDP, portail }) })).json();
  for (let i = 0; i < 40 && nbOtp() === avant; i++) await new Promise((ok) => setTimeout(ok, 250));
  const r2 = await (await fetch(`${BASE}/api/auth/mfa/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mfa_token: r1.mfa_token, code: codeOtp() }) })).json();
  return r2.token;
}

async function mobile(b) {
  const taille = { width: 412, height: 860 };
  const famille = await contexte(b, 'd1-famille-visio', taille, { permissions: ['camera', 'microphone'] });
  await connexionPortail(famille, 'parent@samaxhel.sn', 'cepiad', false);
  await famille.pause(4000);
  await famille.defiler(300, 3);
  await famille.pause(1500);
  // Le médecin référent programme la consultation vidéo (comme dans son agenda)
  const jeton = await jetonPro('medecin@cepiad.samaxhel.sn', 'cepiad');
  const h = { 'content-type': 'application/json', authorization: `Bearer ${jeton}` };
  const suivis = await (await fetch(`${BASE}/api/suivis`, { headers: h })).json();
  const sv = suivis.suivis.find((s) => s.statut === 'ACTIF') || suivis.suivis[0];
  const rdv = await (await fetch(`${BASE}/api/rendez-vous`, { method: 'POST', headers: h, body: JSON.stringify({
    enfant_id: sv.enfant_id, type: 'TELECONSULTATION', date_confirmee: new Date(Date.now() + 60000).toISOString(), motif: 'Suivi en vidéo' }) })).json();
  const liste = await (await fetch(`${BASE}/api/rendez-vous`, { headers: h })).json();
  const consultation = (liste.rendez_vous || []).find((r) => r.id === rdv.rendez_vous?.id)?.consultation_id;
  console.log('consultation', consultation, JSON.stringify(rdv).slice(0, 200));
  await famille.aller('/maison/cepiad', 4000);
  await famille.defiler(300, 3);
  await famille.pause(1500);
  // Le médecin (ordinateur) et la famille (téléphone) rejoignent la même consultation
  const medecin = await contexte(b, 'd2-medecin-visio', { width: 900, height: 860 }, { permissions: ['camera', 'microphone'] });
  await connexionPortail(medecin, 'medecin@cepiad.samaxhel.sn', 'cepiad');
  await medecin.aller(`/visio/${consultation}`, 3000);
  await famille.aller(`/visio/${consultation}`, 9000);
  await medecin.pause(4000);
  await famille.ctx.close();
  await medecin.ctx.close();
}

// Accueil général SAMA XHEL → plusieurs hôpitaux, chacun avec son espace
async function accueil(b, taille, nom) {
  const t = await contexte(b, nom, taille);
  await t.p.goto(`${BASE}/app/`); await t.pause(7000);            // écran de bienvenue (diaporama)
  await t.texte('J’ai déjà un compte', 2500);
  await t.saisir('Téléphone ou e-mail', 'parent@samaxhel.sn');
  await t.saisir('Mot de passe', MDP);
  await t.clic('Se connecter', 5000);                              // accueil général SAMA XHEL
  await t.defiler(260, 6);
  await t.defiler(-4000, 1);
  if (taille.width < 600) await t.defiler(400, 4);               // sur téléphone : descendre jusqu'aux hôpitaux
  await t.texte(/Keur Xaleyi|KEUR XALEYI/, 3500);                  // un autre hôpital partenaire
  await t.clic('Rejoindre cet établissement', 2000);
  await t.saisir('Pourquoi consultez-vous ? (facultatif)', 'Retard de langage');
  await t.clic('Envoyer la demande', 5000);                        // son espace, à ses couleurs
  await t.defiler(250, 2);
  await t.clic(/Retour/, 3000);
  await t.defiler(-4000, 1);
  await t.pause(1500);
  await t.texte(/CEPIAD/, 4000);                                   // l'espace du CEPIAD
  await t.defiler(260, 3);
  await t.clic(/Retour/, 2500);
  await t.ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const quoi = process.argv[2];
  if (quoi === 'site') await site(b);
  if (quoi === 'accueil-ordinateur') await accueil(b, { width: 1280, height: 800 }, 'accueil-ordinateur');
  if (quoi === 'accueil-mobile') await accueil(b, { width: 412, height: 860 }, 'accueil-mobile');
  if (quoi === 'decouverte') await decouverte(b);
  if (quoi === 'personnel') await personnel(b);
  if (quoi === 'suivi') await suivi(b);
  if (quoi === 'visio') await mobile(b);
  await b.close();
  console.log('fin', quoi);
})().catch((e) => { console.error(e.message); process.exit(1); });
