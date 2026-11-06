const { chromium } = require('playwright');
const { session } = require('./outils');
(async () => {
  const b = await chromium.launch();
  const s = await session(b, 'super', 1280, 'n_super');
  await s.p.waitForTimeout(3000); await s.shot('supervision'); await s.p.mouse.wheel(0, 900); await s.shot('supervision_bas');
  console.log(s.erreurs.slice(0, 5).join('\n') || 'ok'); await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
