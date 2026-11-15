import './styles.css';
import { computeRankings, defaultFilters, isGlobal, toCsv, nameOf } from './calc/rankings.js';
import { $, esc, download, initTooltips, portraitUrl, setPortrait, clearPortraits } from './ui/util.js';
import * as V from './ui/views.js';

const TABS = [['overview', 'Overview'], ['batters', 'Batters'], ['bowlers', 'Bowlers'], ['compare', 'Compare'], ['pressure', 'Pressure explorer'], ['models', 'Model evaluation'], ['uncertainty', 'Uncertainty'], ['fit', 'RR squad fit'], ['portraits', 'Portraits']];
const state = {
  ...defaultFilters(), tab: 'overview', search: '', view: '3d', layout: 'cards', selected: null, compare: [], sort: null,
  explore: { innings: 2, target: 170, score: 118, wickets: 5, balls: 90 }, cutoff: 0.5, evalsplit: 'test', caltarget: 'dismissal', drawerOpen: false,
};
let stage = null, stageToken = 0, lastFocus = null;

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
function context() {
  const ranked = computeRankings(state);
  let shown = ranked.filter((r) => state.elig === 'all' || r.eligible);
  if (state.search) shown = shown.filter((r) => norm(r.player).includes(norm(state.search)));
  const sceneRows = ranked.filter((r) => r.eligible).slice(0, 10);
  return { state, ranked, shown, sceneRows };
}

/* ---------- Chrome: nav, filters, chips, status ---------- */
function renderNav() {
  $('nav').innerHTML = TABS.map(([id, t]) => `<button type="button" data-action="goto" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}>${t}</button>`).join('');
}
function syncFilterControls() {
  $('f-season').value = state.season; $('f-comp').value = state.comp; $('f-phase').value = state.phase; $('f-elig').value = state.elig;
  if ($('f-search').value !== state.search) $('f-search').value = state.search;
}
function renderChips() {
  const chips = [];
  if (state.season !== 'all') chips.push(['season', `Season ${state.season}`]);
  if (state.comp !== 'all') chips.push(['comp', state.comp]);
  if (state.phase !== 'all') chips.push(['phase', state.phase]);
  if (state.elig === 'all') chips.push(['elig', 'All players (exploratory)']);
  if (state.search) chips.push(['search', `Search: “${state.search}”`]);
  $('chips').innerHTML = chips.map(([k, l]) => `<span class="chip">${esc(l)}<button type="button" data-action="clear-chip" data-k="${k}" aria-label="Remove filter ${esc(l)}">×</button></span>`).join('');
}
function renderStatus(ctx) {
  const e = ctx.ranked.filter((r) => r.eligible).length;
  $('status').textContent = `${state.role === 'bat' ? 'Batters' : 'Bowlers'} · ${ctx.shown.length} shown, ${e} eligible. ` + (isGlobal(state)
    ? 'Global view: bootstrap intervals shown where available.'
    : 'Filters recompute ratings and ranks from filtered player-match evidence with the original formulas and fixed gates (120 pressure events, 10 pressure matches, 120 normal events). Bootstrap intervals are NOT recomputed, so they are hidden. Model and squad-fit tables stay global.');
}

/* ---------- Rendering ---------- */
const needsRole = { batters: 'bat', bowlers: 'bowl' };
let rendering = false, pendingRender = false;
function render() {
  // Re-entrancy guard: removing a focused <input> mid-render can fire a blur→change event that calls render() again.
  if (rendering) { pendingRender = true; return; }
  rendering = true;
  try { renderOnce(); } finally { rendering = false; }
  if (pendingRender) { pendingRender = false; queueMicrotask(render); }
}
function renderOnce() {
  if (needsRole[state.tab]) state.role = needsRole[state.tab];
  const ctx = context();
  renderNav(); syncFilterControls(); renderChips(); renderStatus(ctx);
  const main = $('main');
  teardownStage();
  const t = state.tab;
  main.innerHTML = t === 'overview' ? V.overviewView(ctx) : t === 'batters' || t === 'bowlers' ? V.leaderboardView(ctx) : t === 'compare' ? V.compareView(ctx) : t === 'pressure' ? V.explorerView(ctx) : t === 'models' ? V.modelsView(ctx) : t === 'uncertainty' ? V.uncertaintyView(ctx) : t === 'fit' ? V.fitView(ctx) : V.portraitsView();
  if (t === 'overview' && state.view === '3d') mountStage(ctx);
  if (state.drawerOpen) renderDrawer(ctx);
  document.title = `${TABS.find((x) => x[0] === t)[1]} · Auction War Room (independent, private)`;
}

function teardownStage() { stageToken++; if (stage) { stage.destroy(); stage = null; } }
async function mountStage(ctx) {
  const el = $('stage'); if (!el) return;
  const token = stageToken;
  if (!ctx.sceneRows.length) { el.innerHTML = `<div class="fallback"><b>No eligible players in this slice.</b><p>The 3D scene shows the top 10 eligible players. Reset filters or use Table view.</p></div>`; return; }
  try {
    const { createStage } = await import('./scene/stadium.js'); // lazy: three.js is only fetched here
    if (token !== stageToken) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage = createStage(el, { reduced, portraitUrl, onSelect: (id) => openDrawer(id) });
    await stage.setRows(ctx.sceneRows);
    if (state.selected && ctx.sceneRows.some((r) => r.player_id === state.selected)) stage.select(state.selected);
    window.__stage = stage; // used by the local test script only
  } catch (err) {
    el.innerHTML = `<div class="fallback" role="status"><b>3D view unavailable on this device (${esc(err.message)}).</b><p>All data remains available below. Showing the portrait card list instead.</p></div>`;
    el.style.height = 'auto';
    el.insertAdjacentHTML('beforeend', V.rankingCards(ctx.sceneRows, state));
  }
}

/* ---------- Drawer ---------- */
function openDrawer(id) {
  lastFocus = document.activeElement; state.selected = id; state.drawerOpen = true;
  const ctx = context();
  renderDrawer(ctx);
  stage?.select(id);
  document.querySelectorAll('.rail button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.id === id)));
}
function renderDrawer(ctx) {
  const d = $('drawer'); d.innerHTML = V.drawerHtml(ctx, state.selected); d.hidden = false; $('scrim').hidden = false;
  d.querySelector('.close')?.focus();
}
function closeDrawer() {
  state.drawerOpen = false; $('drawer').hidden = true; $('drawer').innerHTML = ''; $('scrim').hidden = true; stage?.resetCamera(); state.selected = null;
  document.querySelectorAll('.rail button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  lastFocus?.focus?.();
}

/* ---------- CSV export of the current view ---------- */
function exportCurrent() {
  const ctx = context();
  let rows = ctx.shown;
  if (state.tab === 'overview' && state.view === '3d') rows = ctx.sceneRows;
  rows = sortedForExport(rows);
  const scope = [state.role, state.season, state.comp, state.phase, state.elig].join('_');
  const header = `# Independent RR pressure analysis (private). Scope: ${V.scopeText(state)}. Discipline: ${state.role}. Ratings are run-equivalents per 100 pressure delivery events. Bootstrap columns are blank when filters are active (not recomputed).\n`;
  download(`war_room_${scope}.csv`, header + toCsv(rows));
}
const sortedForExport = (rows) => (state.sort ? V.sortRows(rows, state.sort) : rows);

/* ---------- Events ---------- */
document.addEventListener('click', (e) => {
  if (e.target.id === 'scrim') return closeDrawer();
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action, v = el.dataset.v, id = el.dataset.id ? +el.dataset.id : null;
  switch (a) {
    case 'goto': state.tab = el.dataset.tab; state.sort = null; if (state.drawerOpen) { state.drawerOpen = false; $('drawer').hidden = true; $('drawer').innerHTML = ''; $('scrim').hidden = true; } render(); $('main').focus({ preventScroll: true }); scrollTo({ top: 0 }); break;
    case 'open': openDrawer(id); break;
    case 'close-drawer': closeDrawer(); break;
    case 'role': state.role = v; state.compare = []; state.selected = null; state.sort = null; render(); break;
    case 'view': state.view = v; render(); break;
    case 'layout': state.layout = v; render(); break;
    case 'sort': state.sort = state.sort?.key === el.dataset.key ? (state.sort.dir === 'desc' ? { key: el.dataset.key, dir: 'asc' } : null) : { key: el.dataset.key, dir: el.dataset.key === 'player' ? 'asc' : 'desc' }; render(); break;
    case 'reset-camera': stage?.resetCamera(); break;
    case 'clear-chip': { const k = el.dataset.k; if (k === 'search') state.search = ''; else if (k === 'elig') state.elig = 'eligible'; else state[k] = 'all'; render(); break; }
    case 'cmp-add': { const sel = $('cmp-select'); if (sel?.value && state.compare.length < 4) { state.compare.push(+sel.value); render(); } break; }
    case 'cmp-remove': state.compare = state.compare.filter((x) => x !== id); render(); break;
    case 'cmp-clear': state.compare = []; render(); break;
    case 'sample': Object.assign(state.explore, V.SAMPLE_STATES[+el.dataset.i]); render(); break;
    case 'evalsplit': state.evalsplit = v; render(); break;
    case 'export-portraits': download('player_image_map.confirmed.json', V.exportPortraitJson(), 'application/json'); break;
    case 'reset-portraits': clearPortraits(); render(); break;
    default:
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.ex) { const k = t.dataset.ex; state.explore[k] = +t.value; if (k === 'innings') state.explore.target = state.explore.innings === 2 ? Math.max(state.explore.target, state.explore.score + 1) : 0; render(); }
  else if (t.id === 'caltarget') { state.caltarget = t.value; render(); }
  else if (t.dataset.pmap) { setPortrait(t.dataset.pmap, t.value, 'unconfirmed'); render(); }
  else if (t.dataset.pconfirm) { const sel = document.querySelector(`[data-pmap="${t.dataset.pconfirm}"]`); setPortrait(t.dataset.pconfirm, sel.value, t.checked ? 'confirmed' : 'unconfirmed'); render(); }
});
document.addEventListener('input', (e) => { if (e.target.id === 'cutoff') { state.cutoff = +e.target.value; const pos = e.target.selectionStart; render(); const n = $('cutoff'); n?.focus(); } });
for (const [id, key] of [['f-season', 'season'], ['f-comp', 'comp'], ['f-phase', 'phase'], ['f-elig', 'elig']]) $(id).addEventListener('change', (e) => { state[key] = e.target.value; render(); });
let st; $('f-search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { state.search = e.target.value.trim(); render(); }, 150); });
$('f-reset').addEventListener('click', () => { Object.assign(state, { season: 'all', comp: 'all', phase: 'all', elig: 'eligible', search: '', sort: null }); render(); });
$('f-export').addEventListener('click', exportCurrent);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.drawerOpen) closeDrawer();
  if (e.key === 'Tab' && state.drawerOpen) { // keep focus inside the modal drawer
    const f = [...$('drawer').querySelectorAll('button,[href],select,input,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) stage?.kick(); });
// Re-theme the 3D cards if portrait assignments change in another section
window.addEventListener('storage', () => stage?.redrawAll());

initTooltips();
render();
