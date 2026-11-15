// Calculation layer — a faithful port of the original private_dashboard.html logic.
// Do NOT change the statistics here. Constants are the documented analysis assumptions:
//   200-event prior (shrinkage), eligibility gates 120 pressure events / 10 pressure matches /
//   120 normal events. Residuals are run-equivalents per delivery event from the supplied models.
import data from '../data/data.json';

export const PRIOR = 200;
export const GATES = { pressureEvents: 120, pressureMatches: 10, normalEvents: 120 };
export const L = data.eventLegend;
export const ROLES = ['bat', 'bowl'];
const E = data.events;

export const nameOf = (id) => data.names[id] ?? String(id);
const metaByRole = {};
for (const r of ROLES) metaByRole[r] = new Map(data.ranks[r].map((x) => [x.player_id, x]));
export const meta = (role, id) => metaByRole[role].get(id);

export const defaultFilters = () => ({ role: 'bat', season: 'all', comp: 'all', phase: 'all', elig: 'eligible' });
export const isGlobal = (f) => f.season === 'all' && f.comp === 'all' && f.phase === 'all';

/** Rows of the event table that pass season/competition/phase filters for one role. */
function pass(i, role, f) {
  if (L.role[E.role[i]] !== role) return false;
  if (f.season !== 'all' && E.season[i] !== +f.season) return false;
  if (f.comp !== 'all' && L.comp[E.comp[i]] !== f.comp) return false;
  if (f.phase !== 'all' && L.phase[E.phase[i]] !== f.phase) return false;
  return true;
}

/** Same aggregation and formulas as the original compute(): returns ranked rows. */
export function computeRankings(f, filterPlayer) {
  const role = f.role;
  const map = new Map();
  const n = E.player_id.length;
  for (let i = 0; i < n; i++) {
    if (!pass(i, role, f)) continue;
    if (filterPlayer && !filterPlayer(E.player_id[i])) continue;
    const id = E.player_id[i];
    let r = map.get(id);
    if (!r) {
      r = { player_id: id, pressure_events: 0, normal_events: 0, ps: 0, ns: 0, pm: new Map() };
      map.set(id, r);
    }
    if (E.pressure[i]) {
      r.pressure_events += E.exposure[i];
      r.ps += E.residual[i];
      r.pm.set(E.match_id[i], (r.pm.get(E.match_id[i]) || 0) + E.residual[i]);
    } else {
      r.normal_events += E.exposure[i];
      r.ns += E.residual[i];
    }
  }
  const glob = isGlobal(f);
  const rows = [...map.values()].map((r) => {
    const m = meta(role, r.player_id);
    const pm = r.pm.size;
    const rating = (100 * r.ps) / (r.pressure_events + PRIOR);
    const normal = (100 * r.ns) / (r.normal_events + PRIOR);
    return {
      player_id: r.player_id,
      player: m?.player || nameOf(r.player_id),
      role,
      pressure_events: r.pressure_events,
      normal_events: r.normal_events,
      pressure_matches: pm,
      rating,
      normal,
      uplift: rating - normal,
      consistency: pm ? (100 * [...r.pm.values()].filter((x) => x > 0).length) / pm : null,
      eligible:
        r.pressure_events >= GATES.pressureEvents && pm >= GATES.pressureMatches && r.normal_events >= GATES.normalEvents,
      // Global bootstrap results only; null whenever a filter changes the sample (never recomputed).
      ci_low: glob ? m?.ci_low ?? null : null,
      ci_high: glob ? m?.ci_high ?? null : null,
      top10_frequency: glob && m?.top10_frequency != null ? 100 * m.top10_frequency : null,
    };
  });
  rows.sort((a, b) => (b.eligible - a.eligible) || (b.rating - a.rating) || (b.pressure_events - a.pressure_events));
  let rank = 0;
  for (const r of rows) r.rank = r.eligible ? ++rank : null;
  return rows;
}

/** Per-player evidence split by season / phase / competition using the same formulas (slice-level, ungated). */
export function sliceEvidence(role, playerId, by) {
  const groups = new Map();
  const n = E.player_id.length;
  for (let i = 0; i < n; i++) {
    if (E.player_id[i] !== playerId || L.role[E.role[i]] !== role) continue;
    const key = by === 'season' ? E.season[i] : by === 'phase' ? L.phase[E.phase[i]] : L.comp[E.comp[i]];
    let g = groups.get(key);
    if (!g) { g = { key, pe: 0, ne: 0, ps: 0, ns: 0, pm: new Set() }; groups.set(key, g); }
    if (E.pressure[i]) { g.pe += E.exposure[i]; g.ps += E.residual[i]; g.pm.add(E.match_id[i]); }
    else { g.ne += E.exposure[i]; g.ns += E.residual[i]; }
  }
  return [...groups.values()].map((g) => ({
    key: g.key,
    pressure_events: g.pe,
    pressure_matches: g.pm.size,
    normal_events: g.ne,
    // No pressure events in this slice (e.g. batting Powerplay is never a pressure context): unavailable, not zero
    rating: g.pe > 0 ? (100 * g.ps) / (g.pe + PRIOR) : null,
    normal: g.ne > 0 ? (100 * g.ns) / (g.ne + PRIOR) : null,
    // A slice below the global gates is descriptive only
    meets_gates: g.pe >= GATES.pressureEvents && g.pm.size >= GATES.pressureMatches && g.ne >= GATES.normalEvents,
  }));
}

export function outcomesFor(role, id) {
  const rows = data.outcomes.filter((o) => o.role === role && o.player_id === id);
  return { pressure: rows.find((o) => o.pressure), normal: rows.find((o) => !o.pressure) };
}

export const RANK_COLUMNS = ['rank','player','player_id','rating','normal','uplift','pressure_events','pressure_matches','normal_events','consistency','ci_low','ci_high','top10_frequency'];

export function toCsv(rows, keys = RANK_COLUMNS) {
  const q = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  return [keys.join(','), ...rows.map((r) => keys.map((k) => q(r[k])).join(','))].join('\n');
}

export { data };
