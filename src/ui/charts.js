import { esc, fmt } from './util.js';

export const PALETTE = ['#ff4fa0', '#7cc8f5', '#d9b25f', '#6fe0a8'];
const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
const niceStep = (range, n) => { const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
/** Round-number axis: returns [lo, hi, ticks] with lo/hi snapped outward to the tick step. */
const nice = (lo, hi, n = 5) => { const step = niceStep((hi - lo) || 1, n), a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step; const t = []; for (let v = a; v <= b + step / 2; v += step) t.push(+v.toFixed(10)); return [a, b, t]; };

/** Horizontal interval plot: rows = [{label, low, high, point, color}] — all on one unit axis. */
export function intervalPlot(rows, { title, unit = 'run-equivalents per 100 pressure events', zero = true } = {}) {
  const lo0 = Math.min(...rows.map((r) => r.low), zero ? 0 : Infinity), hi0 = Math.max(...rows.map((r) => r.high), zero ? 0 : -Infinity);
  const [lo, hi, tv] = nice(lo0, hi0, 6);
  const W = 900, rowH = 38, top = 28, left = 200, right = 30, H = top + rows.length * rowH + 44;
  const x = scale(lo, hi, left, W - right);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || 'Interval plot')}">`;
  tv.forEach((t) => { s += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 34}"/><text x="${x(t)}" y="${H - 18}" text-anchor="middle">${fmt(t, 0)}</text>`; });
  if (lo < 0 && hi > 0) s += `<line x1="${x(0)}" x2="${x(0)}" y1="${top - 10}" y2="${H - 34}" stroke="#d9b25f" stroke-dasharray="4 4"/>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2, c = r.color || PALETTE[i % 4];
    s += `<text x="${left - 12}" y="${y + 4}" text-anchor="end">${esc(r.label)}</text><line x1="${x(r.low)}" x2="${x(r.high)}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity=".55"/>`
       + `<circle cx="${x(r.point)}" cy="${y}" r="6.5" fill="${c}" stroke="#07102a" stroke-width="2"><title>${esc(r.label)}: ${fmt(r.point)} [${fmt(r.low)}, ${fmt(r.high)}]</title></circle>`;
  });
  s += `<text x="${(left + W - right) / 2}" y="${H - 2}" text-anchor="middle" fill="#a9b8d6">${esc(unit)}</text></svg>`;
  return s;
}

/** Line chart over categorical x (e.g. seasons). series = [{name,color,points:[{x,y,faded}]}] */
export function lineChart(xs, series, { title, unit = 'pressure rating (run-eq / 100 events)' } = {}) {
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v != null);
  if (!ys.length) return '';
  const [lo, hi, tv] = nice(Math.min(...ys, 0), Math.max(...ys, 0), 4);
  const W = 700, H = 320, L = 56, R = 20, T = 20, B = 46;
  const x = (i) => L + (xs.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (xs.length - 1)), y = scale(lo, hi, H - B, T);
  let s = `<svg class="chart small" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || 'Trend')}">`;
  tv.forEach((v) => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`; });
  if (lo < 0 && hi > 0) s += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#d9b25f" stroke-dasharray="4 4"/>`;
  xs.forEach((v, i) => { s += `<text x="${x(i)}" y="${H - B + 20}" text-anchor="middle">${esc(v)}</text>`; });
  series.forEach((se, k) => {
    const c = se.color || PALETTE[k % 4];
    const pts = se.points.map((p, i) => (p.y == null ? null : [x(i), y(p.y), p])).filter(Boolean);
    if (pts.length > 1) s += `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${pts.map((p) => p[0] + ',' + p[1]).join(' ')}"/>`;
    pts.forEach(([px, py, p]) => { s += `<circle cx="${px}" cy="${py}" r="5" fill="${p.faded ? '#07102a' : c}" stroke="${c}" stroke-width="2"><title>${esc(se.name)} ${esc(p.label ?? '')}: ${fmt(p.y)}${p.faded ? ' (below eligibility gates; descriptive only)' : ''}</title></circle>`; });
  });
  return s + `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" fill="#a9b8d6">${esc(unit)}</text></svg>`;
}

/** Grouped bars: cats = ['Powerplay',…]; series = [{name,color,values:[{y,faded}]}] */
export function groupedBars(cats, series, { title, unit = 'pressure rating' } = {}) {
  const ys = series.flatMap((s) => s.values.map((v) => v?.y)).filter((v) => v != null);
  if (!ys.length) return '';
  const [lo, hi, tv] = nice(Math.min(...ys, 0), Math.max(...ys, 0), 4);
  const W = 700, H = 300, L = 56, R = 16, T = 16, B = 46, y = scale(lo, hi, H - B, T), gw = (W - L - R) / cats.length, bw = Math.min(46, (gw - 14) / series.length);
  let s = `<svg class="chart small" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || 'Grouped bars')}">`;
  tv.forEach((v) => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`; });
  s += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#d9b25f" stroke-dasharray="4 4"/>`;
  cats.forEach((c, i) => {
    const gx = L + i * gw + (gw - bw * series.length) / 2;
    series.forEach((se, k) => {
      const v = se.values[i]; if (!v || v.y == null) return;
      const c0 = se.color || PALETTE[k % 4], y0 = y(0), y1 = y(v.y);
      s += `<rect x="${gx + k * bw}" y="${Math.min(y0, y1)}" width="${bw - 3}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="3" fill="${v.faded ? 'none' : c0}" stroke="${c0}" stroke-width="2" ${v.faded ? 'stroke-dasharray="4 3"' : ''}><title>${esc(se.name)} · ${esc(c)}: ${fmt(v.y)}${v.faded ? ' (below eligibility gates; descriptive only)' : ''}</title></rect>`;
    });
    s += `<text x="${L + i * gw + gw / 2}" y="${H - B + 20}" text-anchor="middle">${esc(c)}</text>`;
  });
  return s + `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" fill="#a9b8d6">${esc(unit)}</text></svg>`;
}

/** Simple horizontal bars: items = [{label, value, max?, note}] */
export function hBars(items, { max, unit = '', color = '#ff4fa0', digits = 1 } = {}) {
  const m = max ?? Math.max(...items.map((i) => i.value), 1);
  return `<div role="list">` + items.map((i) => `<div role="listitem" style="display:grid;grid-template-columns:150px 1fr 74px;gap:10px;align-items:center;margin:6px 0;font-size:13px"><span>${esc(i.label)}</span><span style="background:#0e1a38;border-radius:6px;height:14px;overflow:hidden;display:block"><span style="display:block;height:100%;width:${Math.max(0, Math.min(100, (i.value / m) * 100))}%;background:${color}"></span></span><span style="text-align:right;font-variant-numeric:tabular-nums">${fmt(i.value, digits)}${esc(unit)}</span></div>`).join('') + `</div>`;
}

/** Reliability diagram: bins = [{predicted, observed, n}] per series. */
export function reliability(series) {
  const W = 520, H = 440, L = 54, R = 16, T = 16, B = 50;
  const all = series.flatMap((s) => s.bins), mx = Math.max(0.05, ...all.flatMap((b) => [b.predicted, b.observed])) * 1.1;
  const x = scale(0, mx, L, W - R), y = scale(0, mx, H - B, T);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Reliability diagram: predicted versus observed">`;
  for (let i = 0; i <= 5; i++) { const v = (mx * i) / 5; s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 2)}</text><text x="${x(v)}" y="${H - B + 18}" text-anchor="middle">${fmt(v, 2)}</text>`; }
  s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(mx)}" y2="${y(mx)}" stroke="#d9b25f" stroke-dasharray="5 4"/><text x="${x(mx) - 6}" y="${y(mx) + 16}" text-anchor="end" fill="#d9b25f">perfect calibration</text>`;
  series.forEach((se, k) => { const c = PALETTE[k % 4]; se.bins.forEach((b) => { s += `<circle cx="${x(b.predicted)}" cy="${y(b.observed)}" r="${Math.max(4, Math.min(11, 3 + Math.log10(b.n + 1) * 2))}" fill="${c}" opacity=".8"><title>${esc(se.name)} bin ${esc(b.bin)}: predicted ${fmt(b.predicted, 3)}, observed ${fmt(b.observed, 3)}, n=${b.n}</title></circle>`; }); });
  return s + `<text x="${W / 2}" y="${H - 6}" text-anchor="middle" fill="#a9b8d6">predicted probability</text><text transform="rotate(-90 14 ${H / 2})" x="14" y="${H / 2}" text-anchor="middle" fill="#a9b8d6">observed frequency</text></svg>`;
}
