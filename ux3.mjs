import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// --- keyboard-only: can we roll AND allocate? -----------------------------
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
await p.keyboard.press('Backquote'); await p.waitForTimeout(150);
const rich = await p.$('text=+5000 Score'); if (rich) await rich.click();
await p.keyboard.press('Backquote'); await p.waitForTimeout(300);

// tab until we land on a node, then read the label and press Enter
let label = null, hops = 0;
for (let i = 0; i < 12; i++) {
  await p.keyboard.press('Tab'); hops++;
  const l = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  if (l) { label = l; break; }
}
console.log('tabs to first node:', hops, '| label:', JSON.stringify(label));
const before = await p.$eval('.currencies', n => n.textContent.trim());
await p.keyboard.press('Enter'); await p.waitForTimeout(400);
const after = await p.$eval('.currencies', n => n.textContent.trim());
console.log('allocate by Enter:', before, '->', after, after !== before ? 'WORKS' : 'NO CHANGE');
await p.screenshot({ path: `${out}/07-kbd.png` });

// Space on a focused node must not also roll the dice
const s1 = await p.$eval('.currencies', n => n.textContent.trim());
await p.keyboard.press('Tab');
await p.keyboard.press('Space'); await p.waitForTimeout(900);
const s2 = await p.$eval('.currencies', n => n.textContent.trim());
console.log('space-on-node leaked a roll?', s1, '->', s2);
await p.close();

// --- narrow viewport -------------------------------------------------------
const q = await b.newPage({ viewport: { width: 820, height: 780 }, deviceScaleFactor: 2 });
await q.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await q.waitForTimeout(600);
const side = await q.$('.side'); const sb = side ? await side.boundingBox() : null;
console.log('narrow .side box:', JSON.stringify(sb));
await q.screenshot({ path: `${out}/08-narrow-fixed.png` });
await q.close();

// --- reduced motion --------------------------------------------------------
const r = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 2 });
await r.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await r.waitForTimeout(400);
await r.mouse.click(320, 480); await r.waitForTimeout(350);
const mid = await r.$eval('.currencies', n => n.textContent.trim());
await r.waitForTimeout(1400);
const end = await r.$eval('.currencies', n => n.textContent.trim());
console.log('reduced-motion score 350ms / 1.75s after one roll:', mid, '/', end);
await r.close();
await b.close();
