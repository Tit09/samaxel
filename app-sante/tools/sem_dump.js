const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://localhost:3001/app/'); await p.waitForTimeout(7000);
  await p.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click()); await p.waitForTimeout(800);
  const t = await p.evaluate(() => [...document.querySelectorAll('flt-semantics [role], flt-semantics')].map((e) => (e.getAttribute('role') || '') + ':' + (e.getAttribute('aria-label') || e.textContent || '').slice(0, 40)).filter((x) => x.length > 2).slice(0, 40));
  console.log(t.join('\n'));
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/813802f3-0949-5ced-84e7-1cfca7535a17/scratchpad/bv.png' });
  await b.close();
})();
