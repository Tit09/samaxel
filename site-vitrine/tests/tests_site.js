// Tests de bout en bout du site vitrine (Playwright) : rendu, carte, orientation, test, candidature, don.
const { chromium } = require('playwright');
const OUT = process.env.CAPTURES || require('path').join(__dirname, 'captures');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const b = await chromium.launch({ proxy });
  const erreurs = [];
  for (const [nom, vp] of [['bureau', { width: 1366, height: 860 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: nom === 'mobile' ? 2 : 1, geolocation: { latitude: 14.69, longitude: -17.46 }, permissions: ['geolocation'] });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push(`${nom}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') erreurs.push(`${nom}: ${m.text()}`); });
    await p.goto(process.env.SITE_URL || 'http://localhost:3001/', { waitUntil: 'networkidle' });
    await p.screenshot({ path: `${OUT}/${nom}_01_accueil.png` });
    await p.screenshot({ path: `${OUT}/${nom}_00_page_entiere.png`, fullPage: true });
    if (nom === 'bureau') {
      // Porte « Pour un parent âgé » → annuaire filtré
      await p.click('.porte[data-public="PERSONNE_AGEE"]');
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${OUT}/${nom}_02_personnes_agees.png` });
      console.log('personnes âgées :', await p.textContent('#resultats-titre'));
      console.log('portails :', await p.locator('.portail').count(), 'établissements en ligne');
      console.log('APK :', await p.getAttribute('#lien-apk', 'href'), '| QR :', await p.locator('#qr-apk svg').count());
      await p.selectOption('#f-public', '');
      await p.click('#f-proche'); await p.waitForTimeout(2500);
      console.log('autour de moi :', await p.textContent('#resultats-titre'));
      // Test de repérage
      await p.locator('#test').scrollIntoViewIfNeeded();
      await p.click('#test-liste button >> nth=0'); await p.waitForTimeout(500);
      for (let i = 0; i < 30; i++) {
        const btn = p.locator('#test-questions .reponses button').last();
        if (!(await btn.count())) break;
        await btn.click(); await p.waitForTimeout(120);
      }
      await p.waitForTimeout(1500);
      await p.screenshot({ path: `${OUT}/${nom}_03_resultat_test.png` });
      console.log('test :', (await p.textContent('#test-resultat h3')).trim());
      // Candidature d'un thérapeute avec pièces
      await p.locator('#professionnels').scrollIntoViewIfNeeded();
      await p.click('[data-ouvrir="dlg-pro"]');
      const f = '#form-pro';
      await p.fill(`${f} [name=prenom]`, 'Mariama'); await p.fill(`${f} [name=nom]`, 'Faye');
      await p.selectOption('#pro-structure', { index: 1 });
      await p.selectOption(`${f} [name=role]`, 'THERAPEUTE');
      await p.fill(`${f} [name=specialite]`, 'Orthophoniste');
      await p.fill(`${f} [name=email]`, `mariama.faye${Date.now() % 100000}@exemple.sn`);
      await p.fill(`${f} [name=telephone]`, `77 ${String(Date.now()).slice(-7, -4)} ${String(Date.now()).slice(-4, -2)} ${String(Date.now()).slice(-2)}`);
      await p.fill(`${f} [name=password]`, 'Orthophonie2026');
      const pdf = { name: 'diplome.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') };
      await p.setInputFiles(`${f} [name=DIPLOME]`, pdf);
      await p.setInputFiles(`${f} [name=IDENTITE]`, { ...pdf, name: 'cni.pdf' });
      await p.screenshot({ path: `${OUT}/${nom}_04_candidature.png` });
      await p.click(`${f} button[type=submit]`); await p.waitForTimeout(2500);
      console.log('candidature :', await p.textContent('#pro-message'));
      await p.screenshot({ path: `${OUT}/${nom}_05_candidature_envoyee.png` });
      await p.keyboard.press('Escape');
      await p.locator('#soutenir').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
      await p.screenshot({ path: `${OUT}/${nom}_06_dons.png` });
      // Orange Money : fenêtre avec le numéro de l'agent, puis remerciement festif
      await p.click('.paiement--om'); await p.waitForTimeout(500);
      await p.screenshot({ path: `${OUT}/${nom}_07_orange_money.png` });
      await p.click('#om-fait'); await p.waitForTimeout(900);
      await p.screenshot({ path: `${OUT}/${nom}_08_merci.png` });
      await p.keyboard.press('Escape');
      // Assistant du site
      await p.click('#assistant-ouvrir'); await p.click('#assistant-suggestions button >> nth=0'); await p.waitForTimeout(700);
      await p.fill('#assistant-texte', 'je suis médecin'); await p.press('#assistant-texte', 'Enter'); await p.waitForTimeout(700);
      await p.screenshot({ path: `${OUT}/${nom}_09_assistant.png` });
      console.log('assistant :', (await p.locator('.bulle--lui').count()), 'réponses');
    } else {
      await p.locator('#trouver').scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
      await p.screenshot({ path: `${OUT}/${nom}_02_trouver.png` });
      await p.click('.menu-bouton'); await p.screenshot({ path: `${OUT}/${nom}_03_menu.png` });
    }
    await ctx.close();
  }
  console.log('erreurs :', erreurs.slice(0, 8));
  await b.close();
})();
