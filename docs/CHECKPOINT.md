# Checkpoint / how to resume

State: complete working app + production build + tests. Remaining work is optional polish (see README "Known limitations").

Resume in 3 commands:
```bash
npm install && npm run build
npm run preview &            # http://127.0.0.1:4173
node tests/e2e.mjs           # browser validation (Playwright + Chromium required)
```
Ideas not yet done: split data.json per view to shrink the first load; assign portraits (needs your confirmation); real-GPU / Safari / Firefox / screen-reader passes; per-card keyboard shortcuts inside the 3D canvas (keyboard users use the rail buttons and card list today).
