#!/usr/bin/env python3
"""Create optimised local display copies of the supplied portraits (originals are untouched in assets/originals).
Consistent framing: 4:5 crop anchored to the top-centre (faces sit in the upper part of these head-and-shoulder shots),
scaled to 320x400 WebP. No face recognition or identity inference is performed; identities are NOT assigned here.
The player↔image mapping lives in src/data/player_image_map.json and must be confirmed by a human."""
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC, OUT = ROOT / "assets" / "originals", ROOT / "public" / "players"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 320, 400
manifest = []
for p in sorted(SRC.iterdir(), key=lambda x: (x.name.startswith("imagesbowl"), int("".join(c for c in x.stem if c.isdigit())))):
    im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
    ow, oh = im.size
    target = W / H
    if ow / oh > target:                       # too wide: centre-crop horizontally
        nw = int(oh * target); x0 = (ow - nw) // 2; box = (x0, 0, x0 + nw, oh)
    else:                                      # too tall: keep the top
        nh = int(ow / target); box = (0, 0, ow, nh)
    out = im.crop(box).resize((W, H), Image.LANCZOS)
    dest = OUT / (p.stem + ".webp")
    out.save(dest, "WEBP", quality=82, method=6)
    manifest.append({"file": dest.name, "source": p.name, "discipline_hint": "bowl" if "bowl" in p.stem else "bat",
                     "source_size": [ow, oh], "display_size": [W, H], "bytes": dest.stat().st_size})
(ROOT / "src" / "data" / "image_manifest.json").write_text(json.dumps(manifest, indent=2))
print(len(manifest), "images;", sum(m["bytes"] for m in manifest) // 1024, "KB total")
