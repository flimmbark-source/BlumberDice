import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);

const die = await p.$('canvas') ?? await p.$('.tray');
const box = die ? await die.boundingBox() : null;
console.log('tray box', JSON.stringify(box));
const cx = box ? box.x + box.width / 2 : 320;
const cy = box ? box.y + box.height * 0.55 : 480;

for (let i = 0; i < 12; i++) { await p.mouse.click(cx, cy); await p.waitForTimeout(650); }
await p.screenshot({ path: `${out}/03-after12.png` });
console.log('score after 12:', await p.$eval('.currencies', n => n.textContent.trim()));

// give money, look at the affordance state
await p.keyboard.press('Backquote');
await p.waitForTimeout(200);
const btn = await p.$('text=+5000 Score');
if (btn) { await btn.click(); await btn.click(); await p.waitForTimeout(300); }
await p.keyboard.press('Backquote');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/04-rich.png` });

// hover the node just right of The Die
const nodes = await p.$$eval('.node', ns => ns.length);
console.log('node elements:', nodes);
await b.close();
