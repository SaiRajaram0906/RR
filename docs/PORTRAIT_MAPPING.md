# Portrait mapping status

**Status: 0 of 19 supplied images mapped to a canonical player. This is deliberate.**

Why: the images (`imagesbat1–10`, `imagesbowl1–9`) have no names or captions. Identifying a person from a face is not something I do, and the filename order is not evidence of rank/identity, so no assignment was made. Shown in the UI as initials placeholders with alt text "No confirmed portrait for <name>".

Players needing a portrait (canonical IDs; global rank in brackets) are listed in `src/data/player_image_map.json` (`status: "unconfirmed"`). To confirm: use the in-app **Portraits** tab (dropdown + "I confirm this is …" checkbox), export JSON, replace `src/data/player_image_map.json`, run `npm run build`.

Flags for you:
- 9 bowler images were supplied for the 10 ranked bowlers → at least one bowler remains a placeholder.
- Duplicate assignments (one image for two players) are flagged in the UI.
- Image files are kept untouched in `assets/originals/`; display copies are `public/players/*.webp` (320×400, top-anchored crop, WebP q82).
