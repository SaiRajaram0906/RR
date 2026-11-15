# Auction War Room — independent RR pressure analysis (private, local)

A 3D-enhanced redesign of `RR_private_analysis_bundle/outputs/private_dashboard.html`.
**Independent analysis — not an official Rajasthan Royals product.** The original dashboard and all source files are untouched; this project lives separately and only *reads* the bundle.

## Run it (exact commands)

Requirements: Node.js ≥ 18 and npm (only for install/build). Python 3 + pandas/Pillow only if you regenerate data/images.

```bash
npm install                 # installs vite + three (local, from npm; one-time)
npm run dev                 # http://127.0.0.1:5173  (development server)

npm run build               # production build → dist/
npm run preview             # serves dist/ at http://127.0.0.1:4173
# or any static server, e.g.:  python3 -m http.server 4173 --directory dist
```

**Offline / privacy facts**
- After `npm install` nothing is fetched from the network. The built app makes **no** CDN, font, analytics or API requests (verified: 0 external requests in the browser test). Fonts are system fonts.
- The build is plain static files, but browsers block ES-module scripts on `file://`, so **dist/ must be served over local http** (commands above). Servers bind to 127.0.0.1 only.
- Do not upload `dist/` anywhere without your permission; the data in it is the proprietary analysis.

## Rebuild data / images (optional)

```bash
python3 scripts/build_data.py path/to/rr_work/outputs   # CSVs + audit JSON → src/data/data.json
python3 scripts/build_images.py                          # assets/originals → public/players/*.webp (320×400, top-anchored)
npm test                                                 # calculation layer vs supplied CSVs (17 checks)
node tests/e2e.mjs                                       # browser tests + screenshots (needs `npm run preview` running and Playwright)
```

## What is where

| Path | Purpose |
|---|---|
| `src/calc/rankings.js` | **Calculation layer.** Port of the original dashboard maths: aggregate filtered player-match residuals → pressure/normal rating = 100·Σresidual/(events+200), uplift = rating − normal, fixed gates (≥120 pressure events, ≥10 pressure matches, ≥120 normal events), eligible-first ordering. Bootstrap CI / top-10 frequency are returned **only** for unfiltered views. |
| `src/data/data.json` | Generated from the supplied CSVs (no mock data, nothing hard-coded; top-10 order is computed). |
| `src/scene/stadium.js` | Lazy-loaded Three.js scene: pitch, rope, floodlights, 10 textured portrait cards, raycast click, restrained tilt/lift, camera fly-to, optional orbit, reset. Demand-driven rendering (idle = zero GPU), paused when tab hidden/off-screen, pixel ratio ≤ 2, `prefers-reduced-motion` respected. |
| `src/ui/*.js`, `src/main.js`, `src/styles.css` | Accessible HTML for every view (data never depends on WebGL). |
| `src/data/player_image_map.json` | Explicit player-ID → portrait mapping (see below). |
| `assets/originals/`, `public/players/` | Untouched originals / optimised local display copies. |
| `tests/` | `calc.test.mjs` (17), `e2e.mjs` (25 browser checks), results JSON. |
| `screenshots/` | Overview, rankings, player detail, comparison, mobile, etc. |

## Behaviour you asked to preserve
- Filters (season, competition, phase, eligibility) **recompute ratings and ranks** from filtered player-match evidence with unchanged formulas and gates; the status line says so.
- Filtered views **never show global bootstrap intervals / top-10 frequencies** (cells blank, plots replaced by an explanation, CSV columns blank).
- Model evaluation, sensitivity, repeatability and RR-fit tables are labelled **GLOBAL**; filters do not apply to them.
- Historical rankings (Batters/Bowlers) are kept separate from conditional targets (RR fit tab); availability is shown as *Unverified*, prices as *not estimated*.
- Pressure explorer: real rules in plain language; the scoreboard is a **synthetic example**, and its controls do not change any ranking.
- Rating is never called a percentage/probability; "run-equivalents per 100 pressure delivery events". Bowler cards show actual vs expected runs/wickets (global totals, labelled) and never label delivery-event rates as economy/strike rate.

## Portraits — action needed (identities NOT guessed)
The supplied images contain no names or captions, so I did **not** match faces to players, and the filename order is not evidence. Every portrait is therefore an initials placeholder until you confirm a mapping:
1. Open the **Portraits** tab, choose an image per player, tick “I confirm this is …” (duplicate use of one image is flagged).
2. Choices persist in that browser; **Export mapping JSON** and paste it over `src/data/player_image_map.json` to make it permanent, then `npm run build`.
Counts: 10 batter images and **9** bowler images were supplied for 10 bowlers, so at least one bowler stays a placeholder. Players outside the top 20 always use placeholders. Portraits are 2D textures — not 3D models.

## Known limitations / not done
- Portrait assignment pending your confirmation (above).
- Pressure-explorer band table has no CSV in the bundle; it is copied from the original dashboard's embedded payload by `build_data.py`. The synthetic scoreboard assumes a 120-ball innings.
- Season/phase/competition slices in the detail panel and comparison use the same shrinkage but are descriptive when below the global gates (marked). Batting Powerplay has no pressure events by definition and is shown as unavailable.
- Main JS chunk is ~3.6 MB (≈0.75 MB gzip) because the 4 MB dataset is bundled; Three.js (~117 KB gzip) loads lazily. Splitting data per view is possible but not done.
- Tested in headless Chromium (software WebGL) only; not on real GPUs, Safari/Firefox, or with a screen reader. The long e2e suite occasionally flakes on timing under software rendering (isolated runs are stable).
- No cross-checking of the original dashboard's numbers beyond the CSV tests; no statistical methods were changed.
