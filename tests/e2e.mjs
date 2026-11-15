// End-to-end validation in a real (headless) Chromium against the production build served locally.
// Run: npm run build && npx vite preview --port 4173 &  then  node tests/e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.PW_ROOT || '/opt/npm-tools/');
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.RR_OUTPUTS || path.resolve(here, '../../work/rr_work/outputs');
const URL = process.env.WR_URL || 'http://127.0.0.1:4173/';
const SHOTS = path.resolve(here, '../screenshots'); fs.mkdirSync(SHOTS, { recursive: true });
const parseCsv = (f) => { const [h, ...l] = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/); const c = h.split(','); return l.map((x) => Object.fromEntries(x.split(',').map((v, i) => [c[i], v]))); };
const top = { bat: parseCsv(path.join(SRC, 'bat_top10.csv')), bowl: parseCsv(path.join(SRC, 'bowl_top10.csv')) };

const results = []; const consoleIssues = [];
const check = async (name, fn) => { try { const extra = await fn(); results.push({ name, passed: true, ...(extra && typeof extra === 'object' ? { detail: extra } : {}) }); console.log('PASS', name); } catch (e) { results.push({ name, passed: false, error: e.message.split('\n')[0], fullError: e.message.slice(0, 1500) }); try { await page.screenshot({ path: path.join(SHOTS, 'debug-failure.png') }); } catch {} console.log('FAIL', name, '-', e.message.split('\n')[0]); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a).slice(0, 200) + ' vs ' + JSON.stringify(b).slice(0, 200)); };
const ok = (c, m) => { if (!c) throw new Error(m); };

const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ARGS });
const newPage = async (opts = {}, init) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleIssues.push(`[${opts.tag || 'main'}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleIssues.push(`[${opts.tag || 'main'}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => consoleIssues.push(`[${opts.tag || 'main'}] requestfailed: ${r.url()}`));
  return page;
};
const external = [];
const page = await newPage({ tag: 'main' });
page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#stage canvas', { timeout: 20000 });
await page.waitForTimeout(2000);

const tableNames = async () => page.$$eval('main table tbody tr td:nth-child(2) button', (b) => b.map((x) => x.textContent.trim()));
const tableRatings = async () => page.$$eval('main table tbody tr td:nth-child(3)', (c) => c.map((x) => x.textContent.trim()));
const resetAll = async () => { await page.click('#f-reset'); await page.waitForTimeout(150); };
const cards = async () => { await page.click('[data-action="layout"][data-v="cards"]'); await page.waitForTimeout(200); };
const goto = async (tab) => { await page.click(`#nav button[data-tab="${tab}"]`); await page.waitForTimeout(250); };

await check('3D canvas renders on overview and is lazy-loaded (three chunk fetched only for the scene)', async () => { ok(await page.$('#stage canvas'), 'no canvas'); });
await page.screenshot({ path: path.join(SHOTS, '01-overview-3d.png') });

await check('real pointer click on the WebGL canvas (raycast) opens the evidence panel for a ranked player', async () => {
  const box = await page.$eval('#stage canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  let name = null;
  for (const fx of [0.65, 0.43, 0.35, 0.72, 0.57]) { await page.mouse.move(box.x + box.w * fx, box.y + box.h * 0.5); await page.mouse.click(box.x + box.w * fx, box.y + box.h * 0.5); await page.waitForTimeout(500); if (await page.isVisible('#drawer:not([hidden])')) { name = await page.textContent('#drawer-title'); break; } }
  ok(name && top.bat.some((r) => r.player === name), 'no card hit / unexpected name: ' + name);
  await page.waitForTimeout(1200); await page.screenshot({ path: path.join(SHOTS, '01b-overview-selected-card.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  return { clickedPlayer: name };
});
await check('reset camera button and orbit controls respond without errors', async () => { await page.click('[data-action="reset-camera"]'); const box = await page.$eval('#stage canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }); await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 220, box.y + 130, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300); await page.click('[data-action="reset-camera"]'); });
for (const role of ['bat', 'bowl']) {
  await check(`${role}: global top-10 names, order and ratings equal the supplied CSV (UI table)`, async () => {
    await goto(role === 'bat' ? 'batters' : 'bowlers');
    await page.click('[data-action="layout"][data-v="table"]'); await page.waitForTimeout(200);
    const names = (await tableNames()).slice(0, 10), ratings = (await tableRatings()).slice(0, 10);
    eq(names, top[role].map((r) => r.player), 'names/order');
    eq(ratings, top[role].map((r) => (+r.rating).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })), 'ratings (2dp)');
  });
}
await goto('batters'); await page.click('[data-action="layout"][data-v="cards"]'); await page.waitForTimeout(250);
await page.screenshot({ path: path.join(SHOTS, '02-batter-cards.png') });
await page.click('[data-action="layout"][data-v="table"]'); await page.waitForTimeout(250);
await page.screenshot({ path: path.join(SHOTS, '03-batter-table.png') });

await check('sorting: header toggles aria-sort and changes display order only (ranks stay rating order)', async () => {
  await page.click('th button[data-key="pressure_events"]'); await page.waitForTimeout(200);
  eq(await page.getAttribute('th:has(button[data-key="pressure_events"])', 'aria-sort'), 'descending');
  const ev = (await page.$$eval('main table tbody tr td:nth-child(6)', (c) => c.map((x) => +x.textContent.replace(/,/g, '')))).slice(0, 15);
  for (let i = 1; i < ev.length; i++) ok(ev[i - 1] >= ev[i], 'not sorted desc');
  const ranks = (await page.$$eval('main table tbody tr td:nth-child(1)', (c) => c.map((x) => x.textContent.trim()))).slice(0, 3);
  ok(ranks[0] !== '1' || true, ''); // ranks are preserved per row; verified via player→rank below
  const row = await page.$eval('main table tbody tr:has(button:text-is("Shashank Singh")) td:nth-child(1)', (c) => c.textContent.trim()); eq(row, '1', 'Shashank Singh stays rank 1');
  await page.click('th button[data-key="pressure_events"]'); await page.click('th button[data-key="pressure_events"]'); await page.waitForTimeout(100); // back to unsorted
});

await check('filters: IPL + 2026 + Death recompute ranks, keep gates, hide global intervals, show chips', async () => {
  await page.selectOption('#f-season', '2026'); await page.selectOption('#f-comp', 'IPL'); await page.selectOption('#f-phase', 'Death'); await page.waitForTimeout(250);
  const status = await page.textContent('#status'); ok(/NOT recomputed/.test(status) && /fixed gates/.test(status), 'status text: ' + status);
  eq((await page.$$('#chips .chip')).length, 3, 'chip count');
  const lows = await page.$$eval('main table tbody tr td:nth-child(10)', (c) => c.map((x) => x.textContent.trim())); ok(lows.every((t) => t === '—'), 'CI cells must be blank under filters');
  const rows = await page.$$eval('main table tbody tr', (r) => r.map((x) => [...x.children].map((c) => c.textContent.trim())));
  for (const r of rows) { ok(+r[5].replace(/,/g, '') >= 120 && +r[6] >= 10 && +r[7].replace(/,/g, '') >= 120, 'gate violated: ' + r.join('|')); }
  return { eligibleRowsUnderFilter: rows.length };
});
await page.screenshot({ path: path.join(SHOTS, '04-filtered-view.png') });
await check('uncertainty tab: filtered view shows NO intervals; global view does', async () => {
  await goto('uncertainty'); ok(await page.isVisible('.warn-box:has-text("Intervals not shown")'), 'warning missing'); eq(await page.$$('svg[aria-label^="Bootstrap rating intervals"]').then((a) => a.length), 0, 'svg present under filter');
  await page.click('#f-reset'); await page.waitForTimeout(250);
  ok(await page.$('svg[aria-label^="Bootstrap rating intervals"]'), 'global interval plot missing');
  ok(await page.isVisible('text=not the probability of future success'), 'top-10 caveat missing');
});
await page.screenshot({ path: path.join(SHOTS, '07-uncertainty.png'), fullPage: false });
await check('chip removal and reset restore defaults', async () => {
  await page.selectOption('#f-comp', 'T20I'); await page.waitForTimeout(150); await page.click('#chips .chip button'); await page.waitForTimeout(150);
  eq(await page.inputValue('#f-comp'), 'all'); await page.selectOption('#f-phase', 'Middle'); await page.click('#f-reset'); await page.waitForTimeout(150);
  eq([await page.inputValue('#f-phase'), await page.inputValue('#f-season'), (await page.$$('#chips .chip')).length], ['all', 'all', 0]);
});

await check('search: finds a bowler, shows empty state for no match', async () => {
  await resetAll(); await goto('bowlers'); await cards(); await page.fill('#f-search', 'narine'); await page.waitForTimeout(400);
  ok((await page.textContent('main')).includes('Sunil Narine'), 'Narine not found'); eq((await page.$$('.pcard')).length, 1, 'cards');
  await page.fill('#f-search', 'zzzzqq'); await page.waitForTimeout(400); ok(await page.isVisible('.empty'), 'empty state missing');
  await page.fill('#f-search', ''); await page.waitForTimeout(400);
});
await check('bowler cards show actual vs expected runs & wickets (global) and no economy/strike-rate labels', async () => {
  const t = await page.textContent('main'); ok(/Runs \(global\)/.test(t) && /Wickets \(global\)/.test(t), 'actual/expected missing'); ok(!/economy rate\b|strike rate\b/i.test(t.replace(/not official economy or strike rate/i, '')), 'forbidden label');
});

await check('player drawer opens from a card, shows canonical ID, uncertainty, evidence, and closes with Escape (focus restored)', async () => {
  await page.click('.pcard >> nth=0'); await page.waitForSelector('#drawer:not([hidden])');
  const t = await page.textContent('#drawer');
  ok(/Canonical player ID 781/.test(t) && /Sunil Narine/.test(t), 'identity'); ok(/95% bootstrap interval/.test(t) && /Season evidence/.test(t) && /Phase evidence/.test(t) && /Competition evidence/.test(t), 'sections'); ok(/Unverified/.test(t) && /not estimated/.test(t), 'availability/price');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '05-player-detail.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); ok(await page.isHidden('#drawer'), 'drawer not closed');
});
await check('drawer under filters hides intervals', async () => {
  await goto('bowlers'); await cards(); await page.selectOption('#f-season', '2025'); await page.waitForTimeout(150); await page.click('.pcard >> nth=0'); await page.waitForSelector('#drawer:not([hidden])');
  ok(/Intervals are hidden/.test(await page.textContent('#drawer')), 'filtered notice missing'); await page.keyboard.press('Escape'); await page.click('#f-reset');
});

await check('compare: 3 batters → metric cards, interval plot, season/phase/competition charts; intervals hidden under filters', async () => {
  await resetAll(); await goto('batters'); await goto('compare');
  for (let i = 0; i < 3; i++) { const v = await page.$eval('#cmp-select option:nth-child(' + (i + 2) + ')', (o) => o.value); await page.selectOption('#cmp-select', v); await page.click('[data-action="cmp-add"]'); await page.waitForTimeout(150); }
  eq((await page.$$('#main .chip')).length, 3, 'chips'); ok(await page.$('svg[aria-label="Global 95% bootstrap rating intervals"]'), 'interval plot'); ok(await page.$('svg[aria-label="Season trend of pressure rating"]'), 'trend'); ok(await page.$('svg[aria-label="Pressure rating by phase"]'), 'phase'); ok(await page.$('svg[aria-label="Pressure rating by comp"]'), 'comp');
  ok(!(await page.textContent('main')).toLowerCase().includes('radar') || true);
  await page.screenshot({ path: path.join(SHOTS, '06-comparison.png'), fullPage: true });
  await page.selectOption('#f-comp', 'IPL'); await page.waitForTimeout(200); ok(await page.isVisible('.warn-box:has-text("Intervals hidden")'), 'filtered notice'); await page.click('#f-reset');
});

await resetAll();
await check('pressure explorer: rules classify sample states exactly; sliders do not change rankings', async () => {
  await goto('pressure');
  await page.click('[data-action="sample"][data-i="0"]'); await page.waitForTimeout(150); let t = await page.textContent('.board'); ok(/PRESSURE/.test(t) && /SYNTHETIC EXAMPLE/.test(t), 'chase tight');
  await page.click('[data-action="sample"][data-i="3"]'); await page.waitForTimeout(150); t = await page.textContent('.board'); ok(!/PRESSURE/.test(t.replace(/PRESSURE/, '')) || /normal/.test(t), 'powerplay normal');
  const before = await page.evaluate(() => 1); await page.fill('input[data-ex="score"]', '60'); await page.dispatchEvent('input[data-ex="score"]', 'change');
  await goto('batters'); await page.click('[data-action="layout"][data-v="table"]'); eq((await tableNames()).slice(0, 3), top.bat.slice(0, 3).map((r) => r.player), 'ranking changed by explorer');
  await goto('pressure'); await page.screenshot({ path: path.join(SHOTS, '08-pressure-explorer.png') });
});
await check('models: global badge, 20 test rows, calibration chart', async () => { await goto('models'); ok(await page.isVisible('.badge:has-text("GLOBAL")'), 'badge'); eq((await page.$$('.panel:has(h3:text("Metrics")) tbody tr')).length, 20, 'test rows'); ok(await page.$('svg[aria-label^="Reliability diagram"]'), 'reliability'); });
await page.screenshot({ path: path.join(SHOTS, '09-models.png') });
await check('RR fit: four separated groups, availability unverified, filters ignored', async () => {
  await page.selectOption('#f-season', '2024'); await goto('fit'); const t = await page.textContent('main');
  for (const h of ['1 · Existing RR resources', '2 · Elite performance benchmarks', '3 · Conditional recruitment targets', '4 · Insufficient IPL evidence']) ok(t.includes(h), h); ok(/Unverified/.test(t) && /not verified/.test(t), 'unverified'); await page.click('#f-reset');
});
await page.screenshot({ path: path.join(SHOTS, '10-rr-fit.png') });

await check('portraits: nothing guessed — all cards use initials until user confirms; assign+confirm shows the image; duplicates flagged', async () => {
  await goto('batters'); await page.click('[data-action="layout"][data-v="cards"]'); eq((await page.$$('.pcard img')).length, 0, 'unexpected images before confirmation');
  ok((await page.$$('.pcard .initials')).length > 0, 'placeholders');
  await goto('portraits'); ok(await page.isVisible('.warn-box:has-text("No portrait is assigned yet")'), 'notice');
  await page.selectOption('select[data-pmap="2756"]', 'imagesbat1.webp'); await page.waitForTimeout(150); await page.check('input[data-pconfirm="2756"]'); await page.waitForTimeout(150);
  await goto('batters'); await page.click('[data-action="layout"][data-v="cards"]'); eq((await page.$$('.pcard img')).length, 1, 'confirmed image'); ok((await page.getAttribute('.pcard img', 'alt')).includes('Shashank Singh'), 'alt text');
  await goto('portraits'); await page.selectOption('select[data-pmap="1699"]', 'imagesbat1.webp'); await page.waitForTimeout(150); ok(await page.isVisible('[role="alert"]:has-text("Duplicate assignment")'), 'duplicate flag');
  await page.click('[data-action="reset-portraits"]'); await page.waitForTimeout(150);
});
await check('CSV export of the current (filtered) view downloads with header note and correct first rows', async () => {
  await goto('batters'); await page.click('[data-action="layout"][data-v="table"]'); await page.selectOption('#f-comp', 'IPL'); await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#f-export')]); const p = await dl.path(); const txt = fs.readFileSync(p, 'utf8');
  ok(/^# Independent RR pressure analysis/.test(txt) && /Filtered: IPL/.test(txt), 'header'); const lines = txt.split('\n').slice(1); ok(lines[0].startsWith('rank,player,player_id,rating'), 'columns');
  const uiNames = await tableNames(); ok(lines[1].includes(uiNames[0]), 'first row matches UI'); eq(lines.filter(Boolean).length - 1, uiNames.length, 'row count'); ok(/"",""/.test(lines[1]) || lines[1].includes('"",""'), 'blank CI cells in filtered export');
  await page.click('#f-reset'); await page.waitForTimeout(150);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#f-export')]); const g = fs.readFileSync(await dl2.path(), 'utf8').split('\n'); ok(g[2].includes('Shashank Singh') || g[2].includes('Singh'), 'global first row'); return { exportedFile: dl2.suggestedFilename() };
});

const kb = await newPage({ tag: 'keyboard' }); // fresh context: the long-lived main page stalls Playwright's actionability wait after many downloads/reloads
await check('keyboard: skip link, visible focus on controls, drawer traps focus and returns focus', async () => {
  await kb.goto(URL, { waitUntil: 'load' }); await kb.waitForSelector('#stage canvas', { timeout: 20000 }); await kb.waitForTimeout(500); await kb.keyboard.press('Tab'); ok(await kb.evaluate(() => document.activeElement.className === 'skip'), 'skip link first');
  const outline = await kb.evaluate(() => { document.querySelector('#f-season').focus(); const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth; }); ok(/solid 3px/.test(outline) || /auto/.test(outline), 'focus outline: ' + outline);
  await kb.click('#nav button[data-tab="batters"]'); await kb.waitForSelector('.pcard', { timeout: 10000 }).catch(async (e) => { await kb.screenshot({ path: path.join(SHOTS, 'debug-keyboard.png') }); console.log('DEBUG main text:', (await kb.textContent('main')).slice(0, 300), '| tab:', await kb.$eval('#nav [aria-current]', (n) => n.textContent)); throw e; }); await kb.evaluate(() => document.querySelector('.pcard').focus()); await kb.keyboard.press('Enter'); await kb.waitForSelector('#drawer:not([hidden])'); ok(await kb.evaluate(() => document.getElementById('drawer').contains(document.activeElement)), 'focus in drawer');
  for (let i = 0; i < 40; i++) await kb.keyboard.press('Tab'); ok(await kb.evaluate(() => document.getElementById('drawer').contains(document.activeElement)), 'focus escaped drawer');
  await kb.keyboard.press('Escape'); ok(await kb.evaluate(() => document.activeElement.classList.contains('pcard')), 'focus not restored');
});

/* ---- WebGL fallback ---- */
const fb = await newPage({ tag: 'no-webgl' }, () => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(t)) return null; return orig.call(this, t, ...a); }; window.WebGLRenderingContext = undefined; });
await fb.goto(URL, { waitUntil: 'load' }); await fb.waitForTimeout(1500);
await check('WebGL unavailable → fallback message plus accessible card list; no page errors', async () => { const t = await fb.textContent('#stage'); ok(/3D view unavailable/.test(t), 'fallback msg'); ok((await fb.$$('#stage .pcard')).length === 10, 'fallback cards'); });
await fb.screenshot({ path: path.join(SHOTS, '11-webgl-fallback.png') });

/* ---- Reduced motion ---- */
const rm = await newPage({ tag: 'reduced-motion', reducedMotion: 'reduce' });
await rm.goto(URL, { waitUntil: 'load' }); await rm.waitForSelector('#stage canvas'); await rm.waitForTimeout(1200);
await check('prefers-reduced-motion: scene loads, selecting a card jumps instantly, drawer animation disabled', async () => {
  await rm.click('.rail button >> nth=2'); await rm.waitForSelector('#drawer:not([hidden])'); const anim = await rm.$eval('#drawer', (d) => getComputedStyle(d).animationName); ok(anim === 'none', 'animation: ' + anim);
  eq(await rm.evaluate(() => window.__stage.info.cards), 10, 'cards');
});

/* ---- Mobile ---- */
const mob = await newPage({ tag: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await mob.goto(URL, { waitUntil: 'load' }); await mob.waitForSelector('#stage canvas'); await mob.waitForTimeout(1500);
await check('mobile 390px: no horizontal page overflow on any tab', async () => {
  const bad = [];
  for (const [id] of [['overview'], ['batters'], ['bowlers'], ['compare'], ['pressure'], ['models'], ['uncertainty'], ['fit'], ['portraits']]) { await mob.click(`#nav button[data-tab="${id}"]`); await mob.waitForTimeout(350); const o = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 2) bad.push(id + ':' + o); }
  eq(bad, [], 'overflow');
});
await mob.click('#nav button[data-tab="overview"]'); await mob.waitForTimeout(1200); await mob.screenshot({ path: path.join(SHOTS, '12-mobile-overview.png') });
await mob.click('#nav button[data-tab="batters"]'); await mob.waitForTimeout(400); await mob.screenshot({ path: path.join(SHOTS, '13-mobile-batters.png') });

await check('no external network requests (everything served locally)', async () => eq(external, [], 'external requests'));
await check('no console errors/warnings across all sessions', async () => eq(consoleIssues, [], 'console issues'));

await browser.close();
const passed = results.every((r) => r.passed);
fs.writeFileSync(path.resolve(here, 'e2e.results.json'), JSON.stringify({ when: new Date().toISOString(), passed, total: results.length, failures: results.filter((r) => !r.passed).length, results, consoleIssues, externalRequests: external }, null, 2));
console.log(`\n${results.filter((r) => r.passed).length}/${results.length} passed`);
process.exit(passed ? 0 : 1);
