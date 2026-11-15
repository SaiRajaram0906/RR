// Verifies the ported calculation layer against the supplied CSV outputs (global top-10, order and ratings),
// plus the filtered-view rules. Run: npm test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.RR_OUTPUTS || path.resolve(here, '../../work/rr_work/outputs');
// Node cannot import JSON via the bundler alias; load via a tiny shim.
const { createRequire } = await import('node:module');
const dataPath = path.resolve(here, '../src/data/data.json');
const shim = fs.readFileSync(path.resolve(here, '../src/calc/rankings.js'), 'utf8')
  .replace("import data from '../data/data.json';", `const data = JSON.parse(fs.readFileSync(${JSON.stringify(dataPath)}, 'utf8'));`);
const tmp = path.resolve(here, '.rankings.test.mjs');
fs.writeFileSync(tmp, "import fs from 'node:fs';\n" + shim);
const calc = await import(tmp);
fs.unlinkSync(tmp);

function parseCsv(file) {
  const [h, ...lines] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = h.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}
let pass = 0; const log = [];
const ok = (name, fn) => { try { fn(); pass++; log.push({ name, passed: true }); console.log('PASS', name); } catch (e) { log.push({ name, passed: false, error: e.message }); console.log('FAIL', name, '-', e.message); process.exitCode = 1; } };

for (const role of ['bat', 'bowl']) {
  const expected = parseCsv(path.join(SRC, `${role}_top10.csv`));
  const rows = calc.computeRankings({ ...calc.defaultFilters(), role }).filter((r) => r.eligible).slice(0, 10);
  ok(`${role}: global top-10 ids and order match CSV`, () => assert.deepEqual(rows.map((r) => r.player_id), expected.map((e) => +e.player_id)));
  ok(`${role}: global top-10 names match CSV`, () => assert.deepEqual(rows.map((r) => r.player), expected.map((e) => e.player)));
  ok(`${role}: global top-10 ratings match CSV (1e-6)`, () => rows.forEach((r, i) => assert.ok(Math.abs(r.rating - +expected[i].rating) < 1e-6, `${r.player}: ${r.rating} vs ${expected[i].rating}`)));
  ok(`${role}: global CIs and top-10 frequency present`, () => rows.forEach((r, i) => { assert.ok(Math.abs(r.ci_low - +expected[i].ci_low) < 1e-9); assert.ok(Math.abs(r.top10_frequency / 100 - +expected[i].top10_frequency) < 1e-9); }));
  const all = parseCsv(path.join(SRC, `${role}_all_rankings.csv`));
  const eligCsv = all.filter((a) => a.eligible === 'True').length;
  ok(`${role}: eligible count equals CSV (${eligCsv})`, () => assert.equal(calc.computeRankings({ ...calc.defaultFilters(), role }).filter((r) => r.eligible).length, eligCsv));
  const f = { ...calc.defaultFilters(), role, comp: 'IPL', season: '2026' };
  const filtered = calc.computeRankings(f);
  ok(`${role}: filtered view hides global intervals`, () => filtered.forEach((r) => { assert.equal(r.ci_low, null); assert.equal(r.ci_high, null); assert.equal(r.top10_frequency, null); }));
  ok(`${role}: filtered ranks keep fixed gates`, () => filtered.forEach((r) => { if (r.eligible) assert.ok(r.pressure_events >= 120 && r.pressure_matches >= 10 && r.normal_events >= 120); else assert.equal(r.rank, null); }));
  ok(`${role}: filtered ranks are 1..n in rating order`, () => { const e = filtered.filter((r) => r.eligible); e.forEach((r, i) => assert.equal(r.rank, i + 1)); for (let i = 1; i < e.length; i++) assert.ok(e[i - 1].rating >= e[i].rating); });
}
ok('uplift = shrunk pressure − shrunk normal for global leader', () => { const r = calc.computeRankings(calc.defaultFilters())[0]; const m = calc.meta('bat', r.player_id); assert.ok(Math.abs(r.uplift - m.shrunk_uplift_per100) < 1e-6); });
fs.writeFileSync(path.resolve(here, 'calc.test.results.json'), JSON.stringify({ passed: log.every((l) => l.passed), checks: log }, null, 2));
console.log(`\n${pass}/${log.length} passed`);
