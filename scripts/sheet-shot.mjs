import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1740, height: 1300 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:5201/scripts/sheet.html', { waitUntil: 'networkidle' });
await p.screenshot({ path: process.argv[2], fullPage: true });
await b.close();
