import { data, computeRankings, sliceEvidence, outcomesFor, meta, nameOf, isGlobal, GATES, PRIOR, L } from '../calc/rankings.js';
import { esc, fmt, int, signed, def, unavailable, portraitHtml, portraitMap, imageFiles, manifest, mapFile } from './util.js';
import { intervalPlot, lineChart, groupedBars, hBars, reliability, PALETTE } from './charts.js';

const ROLE_NAME = { bat: 'Batters', bowl: 'Bowlers' };
export const roleName = (r) => ROLE_NAME[r];

export function scopeText(s) {
  const parts = [];
  if (s.season !== 'all') parts.push(`season ${s.season}`);
  if (s.comp !== 'all') parts.push(s.comp);
  if (s.phase !== 'all') parts.push(s.phase);
  return parts.length ? `Filtered: ${parts.join(' · ')} — ranks recomputed on this slice with the same formulas and gates` : 'Global: all ranking seasons, IPL + T20I, all phases';
}
const ciText = (r) => (r.ci_low == null ? '<span class="unavail">hidden (filtered view)</span>' : `${fmt(r.ci_low, 1)} to ${fmt(r.ci_high, 1)}`);

/* ------------------------- Leaderboard ------------------------- */
const COLS = [
  ['rank', 'Rank', 'num'], ['player', 'Player', ''], ['rating', 'Rating', 'num'], ['normal', 'Normal', 'num'], ['uplift', 'Uplift', 'num'],
  ['pressure_events', 'Pressure n', 'num'], ['pressure_matches', 'Pressure matches', 'num'], ['normal_events', 'Normal n', 'num'],
  ['consistency', 'Positive matches %', 'num'], ['ci_low', '95% low', 'num'], ['ci_high', '95% high', 'num'], ['top10_frequency', 'Top-10 boot. %', 'num'],
];
const TIP = { rating: 'rating', normal: 'normal', uplift: 'uplift', pressure_events: 'pressure_events', pressure_matches: 'pressure_matches', normal_events: 'normal_events', consistency: 'consistency', ci_low: 'ci', ci_high: 'ci', top10_frequency: 'top10' };

export function sortRows(rows, sort) {
  if (!sort?.key) return rows;
  const k = sort.key, d = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[k], y = b[k];
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return typeof x === 'number' ? d * (x - y) : d * String(x).localeCompare(String(y));
  });
}

export function rankingTable(rows, state) {
  if (!rows.length) return emptyState(state);
  const head = COLS.map(([k, label, cls]) => {
    const active = state.sort?.key === k;
    const lbl = TIP[k] ? def(TIP[k], label) : esc(label);
    return `<th class="${cls}" scope="col" aria-sort="${active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" data-action="sort" data-key="${k}">${lbl}<span aria-hidden="true">${active ? (state.sort.dir === 'asc' ? '▲' : '▼') : ''}</span></button></th>`;
  }).join('');
  const body = rows.map((r) => `<tr class="clickable">
    <td class="num">${r.rank ?? '<span class="unavail" title="Below eligibility gates">n/e</span>'}</td>
    <td><button type="button" class="btn" style="padding:3px 10px;min-height:30px" data-action="open" data-id="${r.player_id}" aria-label="Open evidence panel for ${esc(r.player)}">${esc(r.player)}</button></td>
    <td class="num">${fmt(r.rating)}</td><td class="num">${fmt(r.normal)}</td><td class="num">${signed(r.uplift, 2)}</td>
    <td class="num">${int(r.pressure_events)}</td><td class="num">${int(r.pressure_matches)}</td><td class="num">${int(r.normal_events)}</td>
    <td class="num">${fmt(r.consistency, 0)}</td><td class="num">${r.ci_low == null ? '—' : fmt(r.ci_low)}</td><td class="num">${r.ci_high == null ? '—' : fmt(r.ci_high)}</td><td class="num">${r.top10_frequency == null ? '—' : fmt(r.top10_frequency, 1)}</td></tr>`).join('');
  return `<div class="tablewrap" tabindex="0" role="region" aria-label="${ROLE_NAME[state.role]} ranking table"><table><caption class="note" style="text-align:left;padding:8px 12px;caption-side:bottom">Sorting changes display order only; <b>Rank</b> is always rating order within the selected slice. “n/e” = not eligible (exploratory rows only). Rating units: run-equivalents per 100 pressure delivery events.</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function emptyState(state) {
  const msg = state.search ? `No ${ROLE_NAME[state.role].toLowerCase()} match “${esc(state.search)}” in this view.` : `No players pass the fixed eligibility gates (${GATES.pressureEvents}+ pressure events, ${GATES.pressureMatches}+ pressure matches, ${GATES.normalEvents}+ normal events) for this slice.`;
  return `<div class="empty" role="status"><b>${msg}</b><p class="note">Try resetting filters${state.elig === 'eligible' ? ', or switch Eligibility to “All players (exploratory)”' : ''}. Gates are not relaxed automatically.</p></div>`;
}

function evidenceLines(r) {
  if (r.role === 'bowl') {
    const o = outcomesFor('bowl', r.player_id).pressure;
    if (!o) return '';
    return `<dt title="Global, all seasons; not filtered">Runs (global)</dt><dd>${int(o.bowler_runs)} act. / ${fmt(o.expected_bowler_runs, 0)} exp.</dd><dt title="Global, all seasons; not filtered">Wickets (global)</dt><dd>${int(o.bowler_wickets)} act. / ${fmt(o.expected_wickets, 1)} exp.</dd>`;
  }
  return '';
}

export function rankingCards(rows, state) {
  if (!rows.length) return emptyState(state);
  return `<div class="cards">` + rows.map((r) => `<button type="button" class="pcard" data-action="open" data-id="${r.player_id}" aria-label="${esc(r.player)}, rank ${r.rank ?? 'not eligible'}. Open evidence panel.">
    <div class="ph">${portraitHtml(r.player_id, r.player)}<span class="rk">${r.rank ? '#' + r.rank : 'n/e'}</span></div>
    <div class="body"><div class="nm">${esc(r.player)}</div>
    <div><span class="big">${fmt(r.rating, 1)}</span> <span class="unit">run-eq / 100 pressure events (not a %)</span></div>
    <dl><dt>Pressure events</dt><dd>${int(r.pressure_events)} in ${int(r.pressure_matches)} matches</dd>
    <dt>Pressure vs normal uplift</dt><dd>${signed(r.uplift, 1)}</dd>
    <dt>95% bootstrap</dt><dd>${ciText(r)}</dd>
    ${r.top10_frequency != null ? `<dt>Top-10 in bootstraps</dt><dd>${fmt(r.top10_frequency, 0)}%</dd>` : ''}${evidenceLines(r)}</dl></div></button>`).join('') + `</div>`;
}

export function leaderboardView(ctx) {
  const { state, shown } = ctx;
  return `<div class="stack"><div class="panel"><div class="stage-ui" style="margin-bottom:12px"><div><h2>${ROLE_NAME[state.role]} leaderboard</h2><p class="note">${esc(scopeText(state))}. Historical ranking — not a forecast and not an auction target list.</p></div>
    <div class="seg" role="group" aria-label="Layout"><button type="button" data-action="layout" data-v="cards" aria-pressed="${state.layout === 'cards'}">Portrait cards</button><button type="button" data-action="layout" data-v="table" aria-pressed="${state.layout === 'table'}">Table</button></div></div>
    ${state.role === 'bowl' ? `<p class="info-box">Bowler cards show model-adjusted run-equivalents. Actual vs expected runs and wickets are <b>global</b> pressure-event totals from the supplied outcome table. Delivery-event rates here are not official economy or strike rate.</p>` : ''}
    ${state.layout === 'cards' ? rankingCards(shown.slice(0, 60), state) : rankingTable(sortRows(shown, state.sort), state)}
    ${shown.length > 60 && state.layout === 'cards' ? `<p class="note">Showing the first 60 cards; use the table or CSV export for all ${shown.length} rows.</p>` : ''}</div></div>`;
}

/* ------------------------- Drawer ------------------------- */
function strengthsLimits(r, fitRow, role) {
  const s = [], l = [];
  if (r.rating > 0) s.push(`Positive pressure rating (${fmt(r.rating, 1)}) over ${int(r.pressure_events)} pressure events.`); else l.push(`Pressure rating is not above context expectation (${fmt(r.rating, 1)}).`);
  if (r.uplift > 0) s.push(`Pressure rating exceeds normal-context rating by ${fmt(r.uplift, 1)}.`); else l.push(`Normal-context rating is at least as high as pressure rating (uplift ${fmt(r.uplift, 1)}).`);
  if (r.consistency != null) (r.consistency >= 60 ? s : l).push(`Positive in ${fmt(r.consistency, 0)}% of ${int(r.pressure_matches)} pressure matches.`);
  if (r.ci_low != null) { if (r.ci_low > 0) s.push('95% bootstrap interval is entirely above zero.'); else l.push('95% bootstrap interval includes zero — exact rank is weakly supported.'); }
  if (r.top10_frequency != null && r.top10_frequency < 60) l.push(`Stays in the top 10 in only ${fmt(r.top10_frequency, 0)}% of bootstrap resamples.`);
  if (!r.eligible) l.push('Below the fixed eligibility gates in this slice: descriptive only, no rank.');
  const meta_ = meta(role, r.player_id);
  if (meta_ && meta_.pressure_matches < 25) l.push(`Only ${int(meta_.pressure_matches)} pressure matches globally — small match sample.`);
  return { s, l };
}

export function drawerHtml(ctx, id) {
  const { state } = ctx;
  const role = state.role, r = ctx.ranked.find((x) => x.player_id === id) || { player_id: id, player: nameOf(id), role, eligible: false, rank: null };
  const fr = data.fit.find((x) => x.player_id === id && x.role === role);
  const o = outcomesFor(role, id), g = meta(role, id);
  const { s, l } = strengthsLimits(r, fr, role);
  const gl = isGlobal(state);
  const seasons = sliceEvidence(role, id, 'season').sort((a, b) => a.key - b.key), phases = sliceEvidence(role, id, 'phase'), comps = sliceEvidence(role, id, 'comp');
  const evTable = (rows, label) => rows.length ? `<table><thead><tr><th>${label}</th><th class="num">Rating</th><th class="num">Normal</th><th class="num">Pressure n</th><th class="num">Matches</th><th>Gates</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${esc(x.key)}</td><td class="num">${fmt(x.rating)}</td><td class="num">${fmt(x.normal)}</td><td class="num">${int(x.pressure_events)}</td><td class="num">${int(x.pressure_matches)}</td><td>${x.pressure_events === 0 ? '<span class="unavail">no pressure events in this context</span>' : x.meets_gates ? 'met' : '<span class="unavail">below — descriptive</span>'}</td></tr>`).join('')}</tbody></table>` : unavailable('No events in the supplied data for this split');
  const actual = role === 'bat'
    ? [['Runs', o.pressure?.bat_runs, o.pressure?.expected_bat_runs, 0], ['Dismissals', o.pressure?.striker_dismissals, o.pressure?.expected_dismissals, 1]]
    : [['Runs conceded', o.pressure?.bowler_runs, o.pressure?.expected_bowler_runs, 0], ['Wickets', o.pressure?.bowler_wickets, o.pressure?.expected_wickets, 1]];
  return `<header><div class="avatar">${portraitHtml(id, r.player)}</div><div><h3 id="drawer-title">${esc(r.player)}</h3><p class="note">Canonical player ID ${id} · ${role === 'bat' ? 'Batting' : 'Bowling'} evidence</p><span class="badge ${gl ? 'global' : 'warn'}">${gl ? 'GLOBAL RANKING' : 'FILTERED SLICE'}</span> ${r.eligible ? `<span class="badge gold">RANK #${r.rank}</span>` : '<span class="badge warn">NOT ELIGIBLE</span>'}</div><button type="button" class="btn close" data-action="close-drawer">Close ✕</button></header>
  <p class="note">${esc(scopeText(state))}</p>
  <section><h4>Pressure and normal performance</h4><div class="metric-grid">
    <div class="metric"><b>${fmt(r.rating)}</b><span>${def('rating', 'Pressure rating')} (run-eq/100)</span></div>
    <div class="metric"><b>${fmt(r.normal)}</b><span>${def('normal', 'Normal rating')}</span></div>
    <div class="metric"><b>${signed(r.uplift, 2)}</b><span>${def('uplift', 'Uplift')}</span></div>
    <div class="metric"><b>${fmt(r.consistency, 0)}%</b><span>${def('consistency', 'Positive pressure matches')}</span></div></div></section>
  <section><h4>Exposure</h4><div class="metric-grid">
    <div class="metric"><b>${int(r.pressure_events)}</b><span>${def('pressure_events', 'Pressure events')}</span></div>
    <div class="metric"><b>${int(r.pressure_matches)}</b><span>${def('pressure_matches', 'Pressure matches')}</span></div>
    <div class="metric"><b>${int(r.normal_events)}</b><span>${def('normal_events', 'Normal events')}</span></div></div></section>
  <section><h4>Uncertainty</h4>${gl && g?.ci_low != null ? `<p>${def('ci', '95% bootstrap interval')}: <b>${fmt(g.ci_low, 1)} to ${fmt(g.ci_high, 1)}</b> · ${def('top10', 'Top-10 frequency')}: <b>${fmt(100 * g.top10_frequency, 1)}%</b> (not a probability of future success). Uplift interval: ${fmt(g.uplift_ci_low, 1)} to ${fmt(g.uplift_ci_high, 1)}.</p>` : gl ? unavailable('No bootstrap interval for this player (not eligible globally)') : `<p class="warn-box">Intervals are hidden: the filtered slice was re-ranked here, but bootstrap intervals are computed only for the global sample and are never shown as if recalculated.</p>`}</section>
  <section><h4>Actual vs expected (global pressure events)</h4>${o.pressure ? `<table><thead><tr><th></th><th class="num">Actual</th><th class="num">Expected</th></tr></thead><tbody>${actual.map(([n, a, e, d]) => `<tr><td>${n}</td><td class="num">${fmt(a, 0)}</td><td class="num">${fmt(e, d ? 1 : 0)}</td></tr>`).join('')}</tbody></table><p class="note">Totals cover all seasons and competitions in the supplied outcome table; they do not respond to filters. Expected values come from the fixed contextual models.</p>` : unavailable()}</section>
  <section><h4>Season evidence</h4>${evTable(seasons, 'Season')}<h4 style="margin-top:14px">Phase evidence</h4>${evTable(phases, 'Phase')}<h4 style="margin-top:14px">Competition evidence</h4>${evTable(comps, 'Competition')}<p class="note">Slice-level ratings use the same 200-event shrinkage. Slices below the global gates are descriptive only; they are not ranked.</p></section>
  <section><h4>Rule-generated reading (from the supplied metrics only)</h4><p class="note">These are automatic statements about the numbers, not scouting judgements.</p>
    <p><b>Strengths</b></p>${s.length ? `<ul class="plain">${s.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : unavailable('No supported strengths in this slice')}
    <p><b>Limitations</b></p>${l.length ? `<ul class="plain">${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : unavailable('None flagged')}
    <p><b>Potential role</b></p><p>${fr?.dominant_pressure_phase ? `Most pressure exposure in 2026: <b>${esc(fr.dominant_pressure_phase)}</b> phase (dominant pressure phase in the supplied fit table). Role and tactical use: ${unavailable('not supported by the data — no scouting conclusion made')}` : unavailable('Not available — no supported role evidence')}</p>
    <p><b>RR status</b>: ${fr ? (fr.published_RR_2026 ? 'Listed in the published 2026 RR squad. ' : 'Not in the published 2026 RR squad. ') : ''}Availability: <b>Unverified</b>. Price: <b>not estimated</b>.</p></section>`;
}

/* ------------------------- Compare ------------------------- */
export function compareView(ctx) {
  const { state, ranked } = ctx;
  const ids = state.compare.filter((id) => ranked.some((r) => r.player_id === id));
  const players = ids.map((id) => ranked.find((r) => r.player_id === id));
  const pool = ranked.filter((r) => !ids.includes(r.player_id)).slice(0, 400);
  const sel = `<div class="filters" style="margin-bottom:14px"><label class="grow">Add a ${state.role === 'bat' ? 'batter' : 'bowler'} (2–4)<select id="cmp-select" ${ids.length >= 4 ? 'disabled' : ''}><option value="">Choose player…</option>${pool.map((r) => `<option value="${r.player_id}">${esc(r.player)}${r.rank ? ' (#' + r.rank + ')' : ' (not eligible)'}</option>`).join('')}</select></label><button type="button" class="btn primary" data-action="cmp-add" ${ids.length >= 4 ? 'disabled' : ''}>Add to comparison</button><button type="button" class="btn" data-action="cmp-clear">Clear</button></div>
  <div class="chips">${players.map((p, i) => `<span class="chip" style="border-color:${PALETTE[i]}"><span class="dot" style="background:${PALETTE[i]}"></span>${esc(p.player)}<button type="button" data-action="cmp-remove" data-id="${p.player_id}" aria-label="Remove ${esc(p.player)}">×</button></span>`).join('')}</div>`;
  if (players.length < 2) return `<div class="panel"><h2>Player comparison</h2><p class="note">Compare two to four players of the same discipline. Switch discipline with the Batters / Bowlers tabs.</p>${sel}<div class="empty">Select at least two players to compare.</div></div>`;
  const metrics = [['rating', 'Pressure rating', 'rating', 2], ['normal', 'Normal rating', 'normal', 2], ['uplift', 'Uplift', 'uplift', 2], ['pressure_events', 'Pressure events', 'pressure_events', 0], ['pressure_matches', 'Pressure matches', 'pressure_matches', 0], ['consistency', 'Positive matches %', 'consistency', 0]];
  const cards = metrics.map(([k, label, tip, n]) => { const best = Math.max(...players.map((p) => p[k] ?? -Infinity)); return `<div class="panel" style="padding:14px"><h4>${def(tip, label)}</h4>${players.map((p, i) => `<div style="display:flex;justify-content:space-between;gap:10px;margin:6px 0;${p[k] === best ? 'font-weight:800;' : ''}"><span><span class="dot" style="background:${PALETTE[i]}"></span>${esc(p.player)}</span><span style="font-variant-numeric:tabular-nums">${fmt(p[k], n)}${k === 'consistency' ? '%' : ''}</span></div>`).join('')}</div>`; }).join('');
  const gl = isGlobal(state);
  const ivRows = players.filter((p) => p.ci_low != null).map((p) => ({ label: p.player, low: p.ci_low, high: p.ci_high, point: p.rating, color: PALETTE[players.indexOf(p)] }));
  const interval = gl ? (ivRows.length ? intervalPlot(ivRows, { title: 'Global 95% bootstrap rating intervals' }) : unavailable('No global intervals for the selected players')) : `<p class="warn-box">Intervals hidden: filters are active and bootstrap intervals are not recomputed.</p>`;
  const bySeason = players.map((p) => sliceEvidence(state.role, p.player_id, 'season'));
  const seasons = [2023, 2024, 2025, 2026];
  const trend = lineChart(seasons, players.map((p, i) => ({ name: p.player, color: PALETTE[i], points: seasons.map((yr) => { const e = bySeason[i].find((x) => x.key === yr); return { y: e ? e.rating : null, label: yr, faded: e && !e.meets_gates }; }) })), { title: 'Season trend of pressure rating' });
  const phases = ['Powerplay', 'Middle', 'Death'], comps = ['IPL', 'T20I'];
  const bars = (cats, by) => groupedBars(cats, players.map((p, i) => ({ name: p.player, color: PALETTE[i], values: cats.map((c) => { const e = sliceEvidence(state.role, p.player_id, by).find((x) => x.key === c); return e ? { y: e.rating, faded: !e.meets_gates } : null; }) })), { title: `Pressure rating by ${by}` });
  const legend = `<div class="legend">${players.map((p, i) => `<span><span class="dot" style="background:${PALETTE[i]}"></span>${esc(p.player)}</span>`).join('')}<span>Hollow marks/dashed bars = slice below eligibility gates (descriptive only)</span></div>`;
  return `<div class="stack"><div class="panel"><h2>Player comparison</h2><p class="note">${esc(scopeText(state))}. Every chart uses one unit: run-equivalents per 100 pressure delivery events (no radar charts — units are not mixed).</p>${sel}</div>
  <div class="row">${cards}</div>
  <div class="panel"><h3>Rating intervals ${gl ? '<span class="badge global">GLOBAL</span>' : ''}</h3>${interval}<p class="note">Bars show the bootstrap interval; overlapping intervals mean the ordering is weakly supported.</p></div>
  <div class="row wide"><div class="panel"><h3>Season trend</h3>${trend}</div><div class="panel"><h3>Phase comparison</h3>${bars(phases, 'phase')}</div><div class="panel"><h3>Competition comparison</h3>${bars(comps, 'comp')}</div></div>${legend}</div>`;
}

/* ------------------------- Pressure explorer ------------------------- */
const clip = (v, a, b) => Math.min(b, Math.max(a, v));
/** The ORIGINAL binary pressure flags (analyse.py), applied to a synthetic state. T20 = 120 planned balls. */
export function classify({ innings, target, score, wickets, balls }) {
  const left = 120 - balls, rrr = innings === 2 ? (6 * (target - score)) / Math.max(1, left) : 0;
  const late = clip(balls / 120, 0, 1);
  const bat = innings === 2 ? (rrr >= 10 && rrr <= 18 && left <= 72) || (wickets >= 4 && balls >= 36 && rrr <= 18) : balls >= 90 || (wickets >= 4 && balls >= 36);
  const bowl = innings === 2 ? left <= 60 && rrr >= 4 && rrr <= 11 : balls >= 90;
  const batIdx = innings === 2 ? 0.5 * clip((rrr - 6) / 8, 0, 1) + 0.25 * late + 0.25 * clip(wickets / 8, 0, 1) : 0.55 * late + 0.45 * clip(wickets / 8, 0, 1);
  const bowlIdx = innings === 2 ? 0.5 * clip((12 - rrr) / 7, 0, 1) + 0.35 * late + 0.15 * ((10 - wickets) / 10) : 0.65 * late + 0.35 * ((10 - wickets) / 10);
  return { left, rrr, bat, bowl, batIdx, bowlIdx };
}
export const SAMPLE_STATES = [
  { name: 'Chase: tight, late', innings: 2, target: 170, score: 118, wickets: 5, balls: 90 },
  { name: 'Chase: cruising', innings: 2, target: 150, score: 95, wickets: 1, balls: 78 },
  { name: 'First innings death', innings: 1, target: 0, score: 128, wickets: 4, balls: 102 },
  { name: 'Early powerplay', innings: 1, target: 0, score: 34, wickets: 0, balls: 30 },
];
export function explorerView(ctx) {
  const { state } = ctx, ex = state.explore;
  const inc = (e) => (state.season === 'all' || e.season_year === +state.season) && (state.comp === 'all' || e.competition === state.comp) && (state.phase === 'all' || e.phase === state.phase);
  const z = data.explorer.filter(inc).filter((e) => e.index_band >= state.cutoff);
  const n = z.reduce((s, e) => s + e.n, 0), runs = z.reduce((s, e) => s + e.bat_runs, 0), wk = z.reduce((s, e) => s + e.dismissals, 0);
  const groups = {};
  for (const e of z) { const k = e.phase + '|' + e.rrr_band; const g = (groups[k] ||= { phase: e.phase, rrr: e.rrr_band, n: 0, runs: 0, wk: 0 }); g.n += e.n; g.runs += e.bat_runs; g.wk += e.dismissals; }
  const c = classify(ex);
  return `<div class="stack"><div class="panel"><h2>Pressure explorer</h2>
  <div class="row"><div><h3>The real pressure rules, in plain language</h3>
  <ul class="plain"><li><b>Batting pressure, chasing:</b> required rate 10–18 with ≤12 overs left, <i>or</i> 4+ wickets down after 6 overs with required rate ≤18.</li>
  <li><b>Batting pressure, first innings:</b> from the 16th over on (90+ balls bowled), <i>or</i> 4+ wickets down after 6 overs.</li>
  <li><b>Bowling pressure, defending:</b> ≤10 overs left with required rate between 4 and 11. <b>First innings:</b> from the 16th over on.</li></ul>
  <p class="note">Flags are set from the state <i>before</i> the ball, never from whether the ball succeeded. The two flags are deliberately different. Rankings use these fixed binary flags.</p></div>
  <div class="board" aria-label="Synthetic example scoreboard"><div class="lbl">SYNTHETIC EXAMPLE — NOT AN ACTUAL MATCH</div>
   <div class="big">${ex.score}/${ex.wickets} <span style="font-size:16px">in ${Math.floor(ex.balls / 6)}.${ex.balls % 6} ov</span></div>
   <div>${ex.innings === 2 ? `Target ${ex.target} · need ${ex.target - ex.score} off ${c.left} · RRR ${fmt(c.rrr)}` : 'First innings'}</div>
   <p style="margin:10px 0">Batting flag: <span class="flag ${c.bat ? 'on' : 'off'}">${c.bat ? 'PRESSURE' : 'normal'}</span> &nbsp; Bowling flag: <span class="flag ${c.bowl ? 'on' : 'off'}">${c.bowl ? 'PRESSURE' : 'normal'}</span></p>
   <div class="lbl">Continuous index (explorer only): batting ${fmt(c.batIdx)} · bowling ${fmt(c.bowlIdx)}</div></div></div>
  <div class="filters" style="margin-top:14px" role="group" aria-label="Sample state controls">
   <label>Innings<select data-ex="innings"><option value="1" ${ex.innings === 1 ? 'selected' : ''}>1st</option><option value="2" ${ex.innings === 2 ? 'selected' : ''}>2nd (chase)</option></select></label>
   <label>Target<input data-ex="target" type="number" min="60" max="260" value="${ex.target}" ${ex.innings === 1 ? 'disabled' : ''}></label>
   <label>Score<input data-ex="score" type="number" min="0" max="260" value="${ex.score}"></label>
   <label>Wickets<input data-ex="wickets" type="number" min="0" max="9" value="${ex.wickets}"></label>
   <label>Balls bowled<input data-ex="balls" type="number" min="0" max="119" value="${ex.balls}"></label>
   ${SAMPLE_STATES.map((s, i) => `<button type="button" class="btn" data-action="sample" data-i="${i}">${esc(s.name)}</button>`).join('')}</div>
  <p class="info-box" style="margin-top:12px">These controls only show how the fixed rules would flag a made-up state. They do <b>not</b> change the official ranking definition or any rating.</p></div>
  <div class="panel"><h3>Descriptive slice of real events by continuous batting index</h3>
   <label class="note">Minimum batting index: <b>${fmt(state.cutoff)}</b><input id="cutoff" type="range" min="0" max="1" step="0.05" value="${state.cutoff}" aria-label="Minimum continuous batting pressure index"></label>
   <p class="note">Season, competition and phase filters apply. Moving this slider changes only this descriptive table, never the rankings.</p>
   <div class="kpis" style="margin:12px 0"><div class="kpi"><b>${int(n)}</b><span>Events in slice</span></div><div class="kpi"><b>${n ? fmt(runs / n) : '—'}</b><span>Bat runs / event</span></div><div class="kpi"><b>${n ? fmt((100 * wk) / n) : '—'}%</b><span>Striker dismissal %</span></div></div>
   ${Object.keys(groups).length ? `<div class="tablewrap"><table><thead><tr><th>Phase</th><th>Pre-ball RRR</th><th class="num">Events</th><th class="num">Bat runs/event</th><th class="num">Dismissal %</th></tr></thead><tbody>${Object.values(groups).map((g) => `<tr><td>${esc(g.phase)}</td><td>${esc(g.rrr)}</td><td class="num">${int(g.n)}</td><td class="num">${fmt(g.runs / g.n)}</td><td class="num">${fmt((100 * g.wk) / g.n)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No events at this index/filters.</div>`}
   <p class="note">Descriptive associations, not causal. Dismissals are striker dismissals only. RRR band “First innings” means no chase context.</p></div></div>`;
}

/* ------------------------- Models ------------------------- */
export function modelsView(ctx) {
  const { state } = ctx, split = state.evalsplit, rows = data.metrics.filter((m) => m.split === split);
  const tgts = ['bat_runs', 'bowl_runs', 'dismissal', 'wicket'];
  const tgt = state.caltarget;
  const bins = (fam) => data.calibration.filter((c) => c.target === tgt && c.family === fam).map((c) => ({ ...c }));
  const fams = [...new Set(data.calibration.filter((c) => c.target === tgt).map((c) => c.family))];
  const sel = Object.entries(data.selected).map(([k, v]) => `<li><b>${esc(k)}</b> → ${esc(v)}</li>`).join('');
  const metricCharts = tgts.map((t) => { const rr = rows.filter((r) => r.target === t); const isRun = t.endsWith('runs'); const key = isRun ? 'mae' : 'log_loss'; const vals = rr.filter((r) => r[key] != null); if (!vals.length) return ''; const mn = Math.min(...vals.map((v) => v[key])); return `<div class="panel" style="padding:14px"><h4>${esc(t)} — ${isRun ? 'MAE' : 'log loss'} (lower is better)</h4>${hBars(vals.map((v) => ({ label: v.family, value: v[key] })), { max: Math.max(...vals.map((v) => v[key])) * 1.05, color: '#7cc8f5', digits: 4 })}<p class="note">Bars start at zero and differences are small — read the exact values. Best: ${esc(vals.find((v) => v[key] === mn).family)} (${fmt(mn, 4)})</p></div>`; }).join('');
  return `<div class="stack"><div class="panel"><h2>Model evaluation <span class="badge global">GLOBAL — does not change with filters</span></h2>
  <p>Training 2022–2024, selection on 2025, untouched 2026 test. Prediction champions were chosen on validation MAE (runs) or log loss (binary outcomes); test metrics did not choose models. The rankings use fixed, interpretable regularised residual models, separately from the flexible prediction champions.</p>
  <div class="row"><div><h4>Validation-selected champions</h4><ul class="plain">${sel}</ul></div><div><h4>Chronological splits</h4><div class="tablewrap"><table><thead><tr><th>Split</th><th class="num">Events</th><th class="num">Matches</th><th>First</th><th>Last</th></tr></thead><tbody>${data.splits.map((s) => `<tr><td>${esc(s.split)}</td><td class="num">${int(s.rows)}</td><td class="num">${int(s.matches)}</td><td>${esc(s.first)}</td><td>${esc(s.last)}</td></tr>`).join('')}</tbody></table></div></div></div></div>
  <div class="panel"><div class="stage-ui"><h3>Metrics</h3><div class="seg" role="group" aria-label="Evaluation period"><button type="button" data-action="evalsplit" data-v="validation" aria-pressed="${split === 'validation'}">Validation 2025</button><button type="button" data-action="evalsplit" data-v="test" aria-pressed="${split === 'test'}">Test 2026</button></div></div>
   <div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Target</th><th>Family</th><th class="num">n</th><th class="num">MAE</th><th class="num">RMSE</th><th class="num">Log loss</th><th class="num">Brier</th><th class="num">AUC</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.target)}</td><td>${esc(r.family)}</td><td class="num">${int(r.n)}</td><td class="num">${fmt(r.mae, 4)}</td><td class="num">${fmt(r.rmse, 4)}</td><td class="num">${fmt(r.log_loss, 4)}</td><td class="num">${fmt(r.brier, 4)}</td><td class="num">${fmt(r.auc, 3)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="row">${metricCharts}</div>
  <div class="panel"><div class="stage-ui"><h3>Test calibration (reliability)</h3><label class="note">Outcome <select id="caltarget">${['dismissal', 'wicket'].map((t) => `<option ${t === tgt ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
   <div class="row" style="align-items:start"><div>${reliability(fams.map((f) => ({ name: f, bins: bins(f) })))}<div class="legend">${fams.map((f, i) => `<span><span class="dot" style="background:${PALETTE[i % 4]}"></span>${esc(f)}</span>`).join('')}</div></div>
   <div class="tablewrap"><table><thead><tr><th>Family</th><th class="num">n</th><th class="num">ECE (10 fixed bins)</th></tr></thead><tbody>${data.calibrationSummary.filter((c) => c.target === tgt).map((c) => `<tr><td>${esc(c.family)}</td><td class="num">${int(c.n)}</td><td class="num">${fmt(c.ece_10_fixed_bins, 5)}</td></tr>`).join('')}</tbody></table></div></div>
   <p class="note">Most events sit in the lowest probability bin, so sparse higher bins are noisy. ECE is bin-sensitive; no test-set recalibration was fitted.</p></div></div>`;
}

/* ------------------------- Uncertainty ------------------------- */
export function uncertaintyView(ctx) {
  const { state, ranked } = ctx, gl = isGlobal(state), top = ranked.filter((r) => r.eligible).slice(0, 10);
  const sens = data.sensitivity.filter((s) => s.role === state.role), rep = data.repeat;
  return `<div class="stack"><div class="panel"><h2>Uncertainty &amp; repeatability</h2>
  <p>600 whole-match bootstrap resamples keep within-match correlation. Intervals condition on the fitted contextual models and on eligibility; they exclude model-estimation uncertainty. <b>Top-10 frequency is sensitivity to match resampling — not the probability of future success.</b></p>
  ${gl ? `<h3>${ROLE_NAME[state.role]}: 95% bootstrap rating intervals <span class="badge global">GLOBAL</span></h3>${intervalPlot(top.map((r) => ({ label: r.player, low: r.ci_low, high: r.ci_high, point: r.rating })), { title: 'Bootstrap rating intervals, top 10' })}
  <h3 style="margin-top:16px">Top-10 bootstrap frequency</h3>${hBars(top.map((r) => ({ label: r.player, value: r.top10_frequency })), { max: 100, unit: '%', color: '#d9b25f' })}`
  : `<div class="warn-box"><b>Intervals not shown.</b> Filtered ranks are recomputed, but bootstrap intervals and top-10 frequencies are <b>not</b> recomputed for filtered samples, so the unchanged global values are hidden. Reset season, competition and phase to see them.</div>`}</div>
  <div class="row"><div class="panel"><h3>Forward repeatability <span class="badge global">GLOBAL</span></h3><div class="tablewrap"><table><thead><tr><th>Role</th><th>Early</th><th>Future</th><th class="num">Matched n</th><th class="num">Spearman</th><th class="num">p-value</th></tr></thead><tbody>${rep.map((r) => `<tr><td>${esc(r.role)}</td><td>${esc(r.early)}</td><td>${esc(r.future)}</td><td class="num">${int(r.players)}</td><td class="num">${fmt(r.spearman, 3)}</td><td class="num">${fmt(r.p_value, 3)}</td></tr>`).join('')}</tbody></table></div>
   <p class="note">Ranks built from 2023–25 pressure evidence show no positive rank correlation with 2026 ranks among the small matched samples. Historical rankings describe history; they are not shown to forecast pressure performance, and no causal “clutch trait” is claimed.</p></div>
  <div class="panel"><h3>Ranking sensitivity — ${ROLE_NAME[state.role].toLowerCase()} <span class="badge global">GLOBAL</span></h3><div class="tablewrap"><table><thead><tr><th>Alternative</th><th class="num">Eligible</th><th class="num">Common</th><th class="num">Rank corr.</th><th class="num">Top-10 overlap</th></tr></thead><tbody>${sens.map((s) => `<tr><td>${esc(s.variant)}</td><td class="num">${int(s.eligible)}</td><td class="num">${int(s.common_eligible)}</td><td class="num">${fmt(s.rank_spearman, 3)}</td><td class="num">${int(s.top10_overlap)} / 10</td></tr>`).join('')}</tbody></table></div><p class="note">Each row changes one assumption (gates, prior, wicket value, drop a season, single competition…).</p></div></div></div>`;
}

/* ------------------------- RR fit ------------------------- */
export function fitView(ctx) {
  const { state } = ctx, role = state.role, fit = data.fit.filter((f) => f.role === role);
  const squad = fit.filter((f) => f.published_RR_2026);
  const bench = fit.filter((f) => f.historical_rank != null).sort((a, b) => a.historical_rank - b.historical_rank).slice(0, 10);
  const targets = data.targets.filter((t) => t.role === role);
  const insuff = fit.filter((f) => f.historical_rank != null && !f.ipl_eligible).sort((a, b) => a.historical_rank - b.historical_rank).slice(0, 15);
  const tb = (rows, cols) => rows.length ? `<div class="tablewrap"><table><thead><tr>${cols.map(([, l, c]) => `<th class="${c || ''}">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map(([k, , c, f]) => `<td class="${c || ''}">${f ? f(r[k], r) : r[k] == null ? '—' : esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="empty">None in the supplied tables for ${ROLE_NAME[role].toLowerCase()}.</div>`;
  const n0 = (v) => (v == null ? '—' : int(v)), n2 = (v) => (v == null ? '—' : fmt(v));
  return `<div class="stack"><div class="panel"><h2>RR squad fit <span class="badge global">GLOBAL — filters do not apply</span></h2>
  <p class="warn-box">Fit tables are scouting prompts built from supplied evidence. They are not acquisition advice. Contract status, retention, fitness, availability and price are <b>not verified</b> and no price is estimated. Not in the published 2026 squad ≠ available at auction.</p>
  <p class="note">Showing ${ROLE_NAME[role].toLowerCase()}. Use the Batters / Bowlers tab to switch.</p></div>
  <div class="panel"><h3>1 · Existing RR resources <span class="badge gold">PUBLISHED 2026 SQUAD</span></h3><p class="note">Official published 2026 squad (retrieved 12 Nov 2026). This is not 2027 contract or retention information. ${data.squad.length} names published; dataset evidence shown only where the player appears as ${ROLE_NAME[role].toLowerCase().slice(0, -1)} in the supplied data.</p>${tb(squad, [['player', 'Player'], ['historical_rank', 'Pooled rank', 'num', n0], ['ipl_pressure_events', 'IPL pressure n', 'num', n0], ['pressure_events_2026', '2026 pressure n', 'num', n0], ['dominant_pressure_phase', 'Dominant pressure phase'], ['ipl_eligible', 'IPL-eligible', '', (v) => (v ? 'Yes' : 'No — insufficient evidence')]])}</div>
  <div class="panel"><h3>2 · Elite performance benchmarks <span class="badge global">HISTORICAL</span></h3><p class="note">Top pooled (IPL + T20I) historical ranks. These are benchmarks for what elite pressure evidence looks like — not recruitment targets.</p>${tb(bench, [['historical_rank', 'Pooled rank', 'num', n0], ['player', 'Player'], ['historical_rating', 'Rating', 'num', n2], ['ipl_rank', 'IPL rank', 'num', n0], ['ipl_pressure_events', 'IPL pressure n', 'num', n0], ['published_RR_2026', 'In RR 2026 squad', '', (v) => (v ? 'Yes' : 'No')]])}</div>
  <div class="panel"><h3>3 · Conditional recruitment targets <span class="badge warn">CONDITIONAL · AVAILABILITY UNVERIFIED</span></h3><p class="note">IPL-eligible, not in the published RR 2026 squad, with ≥30 pressure events in 2026 (selection from the supplied analysis). Pooled and IPL-only ranks are separate.</p>${tb(targets, [['player', 'Player'], ['historical_rank', 'Pooled rank', 'num', n0], ['ipl_rank', 'IPL rank', 'num', n0], ['ipl_rating', 'IPL rating', 'num', n2], ['ipl_pressure_events', 'IPL pressure n', 'num', n0], ['pressure_events_2026', '2026 pressure n', 'num', n0], ['dominant_pressure_phase', 'Pressure phase'], ['availability', 'Availability'], ['auction_price', 'Price']])}</div>
  <div class="panel"><h3>4 · Insufficient IPL evidence <span class="badge warn">TRANSFERABILITY UNKNOWN</span></h3><p class="note">Strong pooled ranks, but below the IPL eligibility gates, so IPL transfer cannot be assessed from this data. Blank = no IPL pressure events recorded.</p>${tb(insuff, [['historical_rank', 'Pooled rank', 'num', n0], ['player', 'Player'], ['historical_rating', 'Pooled rating', 'num', n2], ['ipl_pressure_events', 'IPL pressure n', 'num', n0], ['ipl_pressure_matches', 'IPL pressure matches', 'num', n0], ['availability', 'Availability']])}</div></div>`;
}

/* ------------------------- Portraits (identity mapping) ------------------------- */
export function portraitsView() {
  const map = portraitMap(), entries = Object.entries(map);
  const used = {}; entries.forEach(([id, m]) => { if (m.image) (used[m.image] ||= []).push(id); });
  const dupes = Object.entries(used).filter(([, v]) => v.length > 1);
  const opts = (cur) => `<option value="">— none (initials placeholder) —</option>${imageFiles.map((f) => `<option value="${f}" ${f === cur ? 'selected' : ''}>${f.replace('.webp', '')}</option>`).join('')}`;
  return `<div class="stack"><div class="panel"><h2>Portrait mapping</h2>
  <p class="warn-box"><b>No portrait is assigned yet.</b> The supplied images carry no names or captions, so identities were deliberately <b>not guessed</b> from faces or filenames. Every portrait is shown as an initials placeholder until you confirm a mapping below. Confirmed choices are saved only in this browser; export the JSON to keep them.</p>
  ${dupes.length ? `<p class="warn-box" role="alert">Duplicate assignment: ${dupes.map(([f, ids]) => `${esc(f)} used for ${ids.map((i) => esc(nameOf(+i))).join(' and ')}`).join('; ')}. A portrait should belong to one player.</p>` : ''}
  <h3 style="margin-top:14px">Supplied images (optimised local copies)</h3><div class="portrait-grid">${manifest.map((m) => `<figure><img src="${import.meta.env.BASE_URL}players/${m.file}" alt="Unlabelled supplied portrait ${esc(m.file.replace('.webp', ''))}; player identity not confirmed" loading="lazy"><figcaption>${esc(m.file.replace('.webp', ''))} · hint: ${m.discipline_hint}</figcaption></figure>`).join('')}</div></div>
  <div class="panel"><h3>Assign (top-10 batters &amp; bowlers)</h3>
  ${entries.map(([id, m]) => `<div class="assign"><span><b>${esc(m.canonical_name)}</b><br><span class="note">ID ${id} · ${m.role === 'bat' ? 'batter' : 'bowler'} #${m.global_rank}</span></span>
   <select data-pmap="${id}" aria-label="Portrait for ${esc(m.canonical_name)}">${opts(m.image)}</select>
   <label class="note"><input type="checkbox" data-pconfirm="${id}" ${m.status === 'confirmed' ? 'checked' : ''} ${m.image ? '' : 'disabled'}> I confirm this is ${esc(m.canonical_name)}</label></div>`).join('')}
  <div class="filters" style="margin-top:14px;background:none;border:0;padding:0"><button type="button" class="btn primary" data-action="export-portraits">Export mapping JSON</button><button type="button" class="btn" data-action="reset-portraits">Clear my assignments</button></div>
  <p class="note">Players outside the top 20 always use initials placeholders. Nothing is uploaded anywhere.</p></div></div>`;
}

export function exportPortraitJson() {
  const map = portraitMap();
  return JSON.stringify({ ...mapFile, players: map }, null, 2);
}

/* ------------------------- Overview ------------------------- */
export function overviewView(ctx) {
  const { state, shown } = ctx, a = data.audit;
  const lead = (role) => computeRankings({ role, season: 'all', comp: 'all', phase: 'all', elig: 'eligible' }).filter((r) => r.eligible)[0];
  const lb = lead('bat'), lw = lead('bowl');
  const rb = data.ranks.bat.filter((r) => r.eligible).length, rw = data.ranks.bowl.filter((r) => r.eligible).length;
  return `<div class="stack">
  <div class="panel hero"><div class="stage-ui"><div><h2>War Room</h2><p class="note">${esc(scopeText(state))}</p></div>
    <div class="stage-ui"><div class="seg" role="group" aria-label="Discipline"><button type="button" data-action="role" data-v="bat" aria-pressed="${state.role === 'bat'}">Batters</button><button type="button" data-action="role" data-v="bowl" aria-pressed="${state.role === 'bowl'}">Bowlers</button></div>
    <div class="seg" role="group" aria-label="View mode"><button type="button" data-action="view" data-v="3d" aria-pressed="${state.view === '3d'}">3D view</button><button type="button" data-action="view" data-v="table" aria-pressed="${state.view === 'table'}">Table view</button></div></div></div>
    ${state.view === '3d' ? `<div class="stage-wrap"><div id="stage" aria-label="Interactive 3D stadium showing the top ${Math.min(10, shown.filter((r) => r.eligible).length)} ${ROLE_NAME[state.role].toLowerCase()} as portrait cards. The same data is available in the table and card list."></div></div>
      <div class="stage-ui"><span class="note">Click a card to open the evidence panel. Drag to orbit (optional); the portraits are 2D images on cards, not 3D player models.</span><button type="button" class="btn" data-action="reset-camera">Reset camera</button></div>
      <div class="rail" role="group" aria-label="Players in the 3D scene">${ctx.sceneRows.map((r) => `<button type="button" data-action="open" data-id="${r.player_id}" aria-pressed="${state.selected === r.player_id}">#${r.rank} ${esc(r.player)}</button>`).join('')}</div>`
    : `${rankingTable(sortRows(shown.slice(0, 25), state.sort), state)}<p class="note">Showing top ${Math.min(25, shown.length)} of ${shown.length}. See the Batters / Bowlers tabs for the full list.</p>`}</div>
  <div class="kpis">
    <div class="kpi"><b>${int(a.raw_rows)}</b><span>Raw supplied deliveries · ${int(a.raw_matches)} matches</span></div>
    <div class="kpi"><b>${int(a.included_rows)}</b><span>Retained deliveries (${fmt((100 * a.included_rows) / a.raw_rows, 1)}%)</span></div>
    <div class="kpi"><b>${int(a.included_matches)}</b><span>Retained matches · ${esc(a.min_date)} to ${esc(a.max_date)}</span></div>
    <div class="kpi"><b>${rb} / ${rw}</b><span>Globally eligible batters / bowlers</span></div></div>
  <div class="row"><div class="panel"><h3>Leading findings <span class="badge global">GLOBAL</span></h3>
    <p><b>Batting:</b> ${esc(lb.player)} leads at ${fmt(lb.rating, 1)} run-eq/100 pressure events (95% bootstrap ${fmt(lb.ci_low, 1)} to ${fmt(lb.ci_high, 1)}).</p>
    <p><b>Bowling:</b> ${esc(lw.player)} leads at ${fmt(lw.rating, 1)} (95% bootstrap ${fmt(lw.ci_low, 1)} to ${fmt(lw.ci_high, 1)}).</p>
    <p class="note">These are <b>historical rankings</b> from supplied 2022–2026 data, separate from conditional auction targets on the RR fit tab.</p></div>
  <div class="panel"><h3>Read with care</h3><p class="warn-box">Many 95% intervals overlap, so exact ranks are weakly distinguished. Bootstrap top-10 frequency is not the probability of future success, and 2023–25 ranks did not show positive repeatability into 2026. No causal “clutch” trait is claimed.</p>
    <p style="margin-top:10px"><button class="btn" data-action="goto" data-tab="batters">Rankings</button> <button class="btn" data-action="goto" data-tab="compare">Comparisons</button> <button class="btn" data-action="goto" data-tab="fit">RR fit</button> <button class="btn" data-action="goto" data-tab="uncertainty">Uncertainty</button></p></div></div></div>`;
}
