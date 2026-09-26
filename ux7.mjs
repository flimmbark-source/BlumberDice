import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
console.log('button disabled?', await p.$eval('.tray__roll', n => n.disabled));
await p.focus('.tray__roll');
await p.keyboard.press('Enter');
for (const t of [500, 1500, 3000, 5000]) {
  await p.waitForTimeout(t === 500 ? 500 : 1000);
  console.log(t + 'ms:', await p.$eval('.currencies', n => n.textContent.trim()));
}
// compare against a plain mouse click on the canvas
const box = await (await p.$('canvas')).boundingBox();
await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.58);
await p.waitForTimeout(2500);
console.log('after mouse click:', await p.$eval('.currencies', n => n.textContent.trim()));
await b.close();
