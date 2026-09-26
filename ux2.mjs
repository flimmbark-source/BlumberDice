import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(400);

// --- keyboard reachability -------------------------------------------------
const tour = [];
for (let i = 0; i < 14; i++) {
  await p.keyboard.press('Tab');
  tour.push(await p.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'BODY';
    return `${a.tagName.toLowerCase()}${a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : ''}: ${(a.textContent || '').trim().slice(0, 24)}`;
  }));
}
console.log('TAB ORDER:'); tour.forEach((t, i) => console.log(' ', i + 1, t));

// --- does the tray expose anything semantic? ------------------------------
console.log('tray html:', await p.$eval('.tray, canvas', n => n.outerHTML.slice(0, 220)).catch(() => 'none'));
console.log('node focusable:', await p.$$eval('.node', ns => ns.slice(0,3).map(n => n.getAttribute('tabindex') + '|' + n.tagName)));
console.log('node aria:', await p.$$eval('.node', ns => ns.slice(0,2).map(n => n.getAttribute('aria-label') || n.getAttribute('role') || 'none')));

// --- reduced motion honoured? ---------------------------------------------
console.log('prefers-reduced-motion rules in css:', await p.evaluate(() =>
  [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
    .filter(r => r.conditionText && r.conditionText.includes('reduced-motion')).length));

// --- narrow viewport -------------------------------------------------------
await p.setViewportSize({ width: 820, height: 780 });
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/05-narrow.png` });
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(400);

// --- hover a node in place -------------------------------------------------
const pos = await p.$$eval('.node', ns => ns.map(n => { const r = n.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }));
await p.mouse.move(pos[6][0], pos[6][1]);
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/06-hover.png` });
await b.close();
