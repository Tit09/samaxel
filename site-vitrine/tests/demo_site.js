// Démonstration vidéo du site vitrine. Prérequis : backend sur :3001, site servi sur :5500.
// node tests/demo_site.js /dossier/video
const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2];
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir, size: { width: 1366, height: 768 } },
    geolocation: { latitude: 14.69, longitude: -17.46 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const pause = (ms) => p.waitForTimeout(ms);
  const vers = async (sel) => { await p.locator(sel).first().scrollIntoViewIfNeeded(); await pause(1800); };
  const glisse = async (dy, fois) => { for (let i = 0; i < fois; i++) { await p.mouse.move(683, 400); await p.mouse.wheel(0, dy); await pause(700); } };
  await p.goto('http://localhost:5500/', { waitUntil: 'networkidle' }); await pause(3000);
  await p.selectOption('#phrase-region', 'Dakar'); await pause(800);
  await p.selectOption('#phrase-souci', { label: 'ne parle pas encore' }); await pause(800);
  await p.click('#form-phrase button'); await pause(3500);
  await glisse(250, 3);
  await p.selectOption('#f-region', ''); await p.click('#f-proche'); await pause(3500);
  await glisse(300, 2);
  await vers('#test'); await p.click('#test-liste button >> nth=0'); await pause(1200);
  for (let i = 0; i < 30; i++) {
    const btn = p.locator('#test-questions .reponses button').last();
    if (!(await btn.count())) break;
    await btn.click(); await pause(400);
  }
  await pause(2500); await glisse(300, 2);
  await vers('#sans-lire'); await glisse(250, 3);
  await vers('#professionnels');
  const f = '#form-pro';
  await p.fill(`${f} [name=prenom]`, 'Mariama'); await pause(400); await p.fill(`${f} [name=nom]`, 'Faye'); await pause(400);
  await p.selectOption('#pro-structure', { index: 1 }); await pause(500);
  await p.selectOption(`${f} [name=role]`, 'THERAPEUTE'); await pause(500);
  await p.fill(`${f} [name=specialite]`, 'Orthophoniste'); await pause(800);
  await glisse(300, 3);
  await vers('#soutenir'); await pause(2500);
  await glisse(400, 3); await pause(1500);
  await ctx.close(); await b.close(); console.log('ok');
})().catch((e) => { console.error(e.message); process.exit(1); });
