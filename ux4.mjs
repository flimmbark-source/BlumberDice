import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const money = p => p.$eval('.currencies', n => n.textContent.trim());
const rolls = p => p.evaluate(() => document.querySelectorAll('.feed *').length);

// 1. keyboard allocation of an AVAILABLE node
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
await p.keyboard.press('Backquote'); await p.waitForTimeout(150);
await (await p.$('text=+5000 Score')).click();
await p.keyboard.press('Backquote'); await p.waitForTimeout(1200);

let found = null;
for (let i = 0; i < 40; i++) {
  await p.keyboard.press('Tab');
  const l = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  if (l && l.includes('available')) { found = l; break; }
}
console.log('focused available node:', JSON.stringify(found));
const b1 = await money(p);
await p.keyboard.press('Enter'); await p.waitForTimeout(900);
console.log('  Enter:', b1, '->', await money(p));

// 2. Space on a focused node must allocate, not also throw a die
for (let i = 0; i < 40; i++) {
  await p.keyboard.press('Tab');
  const l = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  if (l && l.includes('available')) break;
}
const diceBefore = await p.evaluate(() => window.__rollCount ?? null);
const b2 = await money(p);
await p.keyboard.press('Space'); await p.waitForTimeout(1200);
console.log('  Space:', b2, '->', await money(p), '(a pure allocation drops by exactly the cost)');
await p.close();

// 3. reduced motion: rolling still works, total does not ease
const r = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await r.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await r.waitForTimeout(500);
const box = await (await r.$('canvas')).boundingBox();
await r.mouse.click(box.x + box.width / 2, box.y + box.height * 0.58);
for (const t of [250, 600, 1200, 2500]) { await r.waitForTimeout(t === 250 ? 250 : t - 0); }
await r.waitForTimeout(100);
console.log('reduced motion, after one click:', await money(r));
await r.screenshot({ path: process.argv[2] + '/09-reduced.png' });
await r.close();
await b.close();
