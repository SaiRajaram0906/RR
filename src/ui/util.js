import mapFile from '../data/player_image_map.json';
import manifest from '../data/image_manifest.json';

export const $ = (id) => document.getElementById(id);
export const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (x, n = 2) => (x === null || x === undefined || Number.isNaN(x) ? '—' : typeof x === 'number' ? (Math.abs(x) < 0.5 * 10 ** -n ? 0 : x).toLocaleString('en-US', { maximumFractionDigits: n, minimumFractionDigits: n }) : String(x));
export const int = (x) => fmt(x, 0);
export const signed = (x, n = 1) => (x === null || x === undefined ? '—' : (x > 0 ? '+' : '') + fmt(x, n));
export const unavailable = (why = 'Not available in the supplied outputs') => `<span class="unavail">${esc(why)}</span>`;

export const GLOSSARY = {
  rating: 'Pressure rating: model-adjusted run-equivalents above context expectation per 100 pressure delivery events, shrunk toward zero with a 200-event prior. Not a percentage or probability. Higher is better.',
  normal: 'Normal rating: the same shrunk residual for non-pressure contexts (200-event prior), same units as the pressure rating.',
  uplift: 'Uplift = shrunk pressure rating minus shrunk normal rating. Positive values mean better in pressure than in normal contexts; it is separate from the rating.',
  pressure_events: 'Pressure events: delivery events in contexts flagged as pressure before the ball. Not official balls faced or bowled.',
  pressure_matches: 'Number of distinct matches containing at least one pressure event for this player. Eligibility needs ≥10.',
  normal_events: 'Delivery events in non-pressure contexts. Eligibility needs ≥120.',
  consistency: 'Share of pressure matches where the summed pressure residual was above zero.',
  ci: '95% whole-match bootstrap interval (600 resamples) for the global rating. Not model-estimation uncertainty. Hidden whenever a filter changes the sample because it is not recomputed.',
  top10: 'Share of bootstrap resamples in which the player stays in the top 10. It is sensitivity to match resampling, NOT the probability of future success.',
  eligible: 'Eligible = ≥120 pressure events, ≥10 pressure matches and ≥120 normal events. Gates are fixed and unchanged under filters.',
  runeq: 'Run-equivalents: runs above/below model expectation, with a wicket worth 6 run-equivalents (4 and 8 tested in sensitivity).',
  shrink: 'Shrinkage: the sum of residuals is divided by (events + 200), pulling small samples toward zero.',
};
export const def = (key, label) => `<span class="def" tabindex="0" data-tip="${esc(GLOSSARY[key] || key)}">${esc(label)}</span>`;

export function initTooltips() {
  const tip = $('tip');
  const show = (el) => { tip.textContent = el.dataset.tip; tip.hidden = false; const r = el.getBoundingClientRect(); tip.style.left = Math.min(r.left, innerWidth - 340) + 'px'; tip.style.top = Math.min(r.bottom + 8, innerHeight - 90) + 'px'; };
  const hide = () => { tip.hidden = true; };
  document.addEventListener('mouseover', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) show(t); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest?.('[data-tip]')) hide(); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) show(t); });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

/* ---------- Portraits: explicit player-ID → image mapping, never guessed ---------- */
const LS = 'rr-war-room-portrait-map-v1';
export const imageFiles = manifest.map((m) => m.file);
const overrides = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
export function portraitMap() {
  const out = {};
  for (const [id, v] of Object.entries(mapFile.players)) out[id] = { ...v };
  for (const [id, v] of Object.entries(overrides())) out[id] = { ...(out[id] || {}), ...v };
  return out;
}
export function setPortrait(id, image, status) {
  const o = overrides(); o[id] = { image: image || null, status: image ? status : 'unconfirmed', confirmed_by: image && status === 'confirmed' ? 'user (in-app assigner)' : null };
  try { localStorage.setItem(LS, JSON.stringify(o)); } catch { /* storage may be disabled */ }
}
export function clearPortraits() { try { localStorage.removeItem(LS); } catch { /* ignore */ } }
/** Returns a URL only for CONFIRMED mappings; anything else gets the initials placeholder. */
export function portraitUrl(id) {
  const m = portraitMap()[String(id)];
  return m && m.status === 'confirmed' && m.image ? `${import.meta.env.BASE_URL}players/${m.image}` : null;
}
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export function portraitHtml(id, name, cls = '') {
  const u = portraitUrl(id);
  return u ? `<img class="${cls}" src="${u}" width="320" height="400" loading="lazy" alt="Portrait of ${esc(name)} (2D photo)">`
           : `<div class="initials ${cls}" role="img" aria-label="No confirmed portrait for ${esc(name)}; initials placeholder">${esc(initials(name))}</div>`;
}
export function download(filename, text, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
export { mapFile, manifest };
