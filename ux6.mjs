import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
// first Tab should now reach the roll control
const order = [];
for (let i = 0; i < 6; i++) {
  await p.keyboard.press('Tab');
  order.push(await p.evaluate(() => { const a = document.activeElement;
    return (a?.getAttribute('aria-label')) || (a?.textContent || '').trim().slice(0,26) || a?.tagName; }));
}
console.log('tab order:', JSON.stringify(order));
await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
// focus the roll button explicitly and activate it
await p.focus('.tray__roll');
await p.screenshot({ path: process.argv[2] + '/12-rollbtn.png', clip: { x: 0, y: 60, width: 640, height: 300 } });
const before = await p.$eval('.currencies', n => n.textContent.trim());
await p.keyboard.press('Enter'); await p.waitForTimeout(1600);
console.log('roll via button:', before, '->', await p.$eval('.currencies', n => n.textContent.trim()));
await b.close();
