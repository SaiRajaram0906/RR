import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/'); const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://127.0.0.1:4173/'); await p.waitForSelector('#stage canvas'); await p.waitForTimeout(1500);
// click a card on the canvas itself (real pointer interaction)
const box = await p.$eval('#stage canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
let opened = false;
for (const fx of [0.57, 0.43, 0.65, 0.35, 0.72]) { await p.mouse.move(box.x + box.w * fx, box.y + box.h * 0.5); await p.mouse.click(box.x + box.w * fx, box.y + box.h * 0.5); await p.waitForTimeout(600); if (await p.isVisible('#drawer:not([hidden])')) { opened = true; console.log('canvas click at', fx, '→', await p.textContent('#drawer-title')); break; } }
console.log('drawer opened by real canvas click:', opened);
await p.keyboard.press('Escape'); await p.waitForTimeout(100);
await p.click('.rail button >> nth=1'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
await p.click('.rail button >> nth=1'); await p.waitForTimeout(1800);
await p.evaluate(() => { document.getElementById('drawer').hidden = true; document.getElementById('scrim').hidden = true; });
await p.screenshot({ path: 'screenshots/01b-overview-selected.png', clip: { x: 0, y: 250, width: 1440, height: 700 } });
await b.close();
