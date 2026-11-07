// Vidéo de démonstration de JÀMMU XEL : parcours scénarisé + journal des voix jouées
// (pour reconstituer la bande son ensuite avec ffmpeg).
const { chromium } = require('playwright');
const fs = require('fs');
const LANGUE = process.argv[2] || 'Français';
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '/home/claude/jeu/captures/video', size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  const journal = [];
  await p.exposeFunction('journalSon', (src) => journal.push({ t: Date.now() - t0, src }));
  await p.addInitScript(() => {
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { try { window.journalSon(this.currentSrc || this.src); } catch (e) {} return orig.apply(this); };
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () { try { window.journalSon('STOP'); } catch (e) {} return pause.apply(this); };
  });
  await p.goto('http://localhost:8090/');
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const e = document.querySelector('flt-semantics-placeholder'); if (e) e.click(); });
  const att = (ms) => p.waitForTimeout(ms);
  const tap = async (name, ms = 2500) => { await p.getByRole('button', { name }).first().click({ timeout: 8000 }); await att(ms); };
  await att(3500);
  await tap(LANGUE, 4500);
  // Espace enfant
  await tap(/^(Jouer|Fo|Play)/, 3000);
  await tap(/émotions|Li ñuy yëg|Feelings/, 3500);
  // touche les visages jusqu'à la bonne réponse (manche 1)
  for (const n of ['Content.', 'Triste.', 'Fâché.', 'Il a peur.', 'Bég na.', 'Tiis na.', 'Mer na.', 'Dafa ragal.', 'Happy.', 'Sad.', 'Angry.', 'Scared.']) {
    const el = p.getByRole('button', { name: n }).first();
    if (await el.count()) { await el.click().catch(() => {}); await att(2600); }
  }
  await att(1500);
  await p.getByRole('button', { name: /Retour|Dellu|Back/ }).first().click(); await att(1500);
  await tap(/Je parle|Damay wax|I speak/, 3000);
  for (const n of [/soif|mar\.|thirsty/, /pause|noppalu|break/, /bruit|Coow|noisy/]) { await tap(n, 2300); }
  await p.getByRole('button', { name: /Retour|Dellu|Back/ }).first().click(); await att(1200);
  await tap(/Respirer|Noyyi|Breathe/, 9000);
  await p.getByRole('button', { name: /Retour|Dellu|Back/ }).first().click(); await att(1200);
  // sortie protégée : appui long
  await p.mouse.move(68, 68); await p.mouse.down(); await att(1900); await p.mouse.up(); await att(2000);
  // Espace parents
  await tap(/^(Comprendre|Xam|Understand)/, 5000);
  await tap(/Awa/, 6500);
  await tap(/Continuer|Wéyal|Continue/, 9000);
  await tap(/sans donner de nom|duma ko tudd|without giving/, 9000);
  await tap(/Continuer|Wéyal|Continue/, 7500);
  await tap(/coin plus calme|gëna dal|quieter/, 8000);
  await tap(/Continuer|Wéyal|Continue/, 7000);
  await tap(/avec respect|teggin|respectfully/, 8000);
  await tap(/Continuer|Wéyal|Continue/, 4000);
  await tap(/carnet ensemble|kayit bi ñoo ñaar|notebook together/, 6500);
  await tap(/Continuer|Wéyal|Continue/, 9000);
  await tap(/Comment l'aider|dimbalee ci kër|help him at home/, 8000);
  await tap(/Continuer|Wéyal|Continue/, 5000);
  await tap(/Continuer|Wéyal|Continue/, 11000);
  await tap(/carnet d'accompagnant|kayitu wujjante|companion/, 6000);
  await p.getByRole('button', { name: /Retour|Dellu|Back/ }).first().click(); await att(1200);
  await p.getByRole('button', { name: /Retour|Dellu|Back/ }).first().click(); await att(2500);
  await tap(/Xel/, 5000);
  const champ = p.getByRole('textbox').first();
  await champ.click(); await champ.pressSequentially("mon fils ne parle pas, c'est le mauvais oeil ?", { delay: 45 }); await p.keyboard.press('Enter'); await att(9500);
  await p.getByRole('button', { name: /Retour|Dellu|Back/ }).first().click(); await att(1500);
  await tap(/ressources|xam-xam|resource/, 4500);
  await tap(/Dépression|Depression/, 2500);
  await att(2000);
  await ctx.close();
  const video = await p.video().path();
  fs.writeFileSync('/home/claude/jeu/captures/video/journal.json', JSON.stringify({ video, journal }, null, 1));
  await b.close();
  console.log(video, journal.length);
})();
