# Test results

- Calculation layer vs supplied CSVs (`npm test`): **17/17 passed**
- Browser end-to-end (`node tests/e2e.mjs`, headless Chromium + software WebGL): **25/25 passed**; console errors/warnings: 0; external network requests: 0

Note: the long e2e suite was flaky in my environment on one step (keyboard check) when run on the long-lived page; it passes in a fresh context and in isolation, so it now runs in its own context. Tested only in headless Chromium with software WebGL.

## Calculation checks
- PASS bat: global top-10 ids and order match CSV
- PASS bat: global top-10 names match CSV
- PASS bat: global top-10 ratings match CSV (1e-6)
- PASS bat: global CIs and top-10 frequency present
- PASS bat: eligible count equals CSV (75)
- PASS bat: filtered view hides global intervals
- PASS bat: filtered ranks keep fixed gates
- PASS bat: filtered ranks are 1..n in rating order
- PASS bowl: global top-10 ids and order match CSV
- PASS bowl: global top-10 names match CSV
- PASS bowl: global top-10 ratings match CSV (1e-6)
- PASS bowl: global CIs and top-10 frequency present
- PASS bowl: eligible count equals CSV (92)
- PASS bowl: filtered view hides global intervals
- PASS bowl: filtered ranks keep fixed gates
- PASS bowl: filtered ranks are 1..n in rating order
- PASS uplift = shrunk pressure − shrunk normal for global leader

## Browser checks
- PASS 3D canvas renders on overview and is lazy-loaded (three chunk fetched only for the scene)
- PASS real pointer click on the WebGL canvas (raycast) opens the evidence panel for a ranked player
- PASS reset camera button and orbit controls respond without errors
- PASS bat: global top-10 names, order and ratings equal the supplied CSV (UI table)
- PASS bowl: global top-10 names, order and ratings equal the supplied CSV (UI table)
- PASS sorting: header toggles aria-sort and changes display order only (ranks stay rating order)
- PASS filters: IPL + 2026 + Death recompute ranks, keep gates, hide global intervals, show chips
- PASS uncertainty tab: filtered view shows NO intervals; global view does
- PASS chip removal and reset restore defaults
- PASS search: finds a bowler, shows empty state for no match
- PASS bowler cards show actual vs expected runs & wickets (global) and no economy/strike-rate labels
- PASS player drawer opens from a card, shows canonical ID, uncertainty, evidence, and closes with Escape (focus restored)
- PASS drawer under filters hides intervals
- PASS compare: 3 batters → metric cards, interval plot, season/phase/competition charts; intervals hidden under filters
- PASS pressure explorer: rules classify sample states exactly; sliders do not change rankings
- PASS models: global badge, 20 test rows, calibration chart
- PASS RR fit: four separated groups, availability unverified, filters ignored
- PASS portraits: nothing guessed — all cards use initials until user confirms; assign+confirm shows the image; duplicates flagged
- PASS CSV export of the current (filtered) view downloads with header note and correct first rows
- PASS keyboard: skip link, visible focus on controls, drawer traps focus and returns focus
- PASS WebGL unavailable → fallback message plus accessible card list; no page errors
- PASS prefers-reduced-motion: scene loads, selecting a card jumps instantly, drawer animation disabled
- PASS mobile 390px: no horizontal page overflow on any tab
- PASS no external network requests (everything served locally)
- PASS no console errors/warnings across all sessions
