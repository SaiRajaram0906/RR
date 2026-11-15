#!/usr/bin/env python3
"""Build src/data/data.json from the supplied analysis outputs (read-only).

Nothing is recomputed or invented. Tables are copied; the player-match
aggregate is the same groupby the original build_deliverables.py performed.
The pressure-explorer bands have no CSV in the bundle, so they are copied from
the original private_dashboard.html payload (key "explorer").

Usage: python3 scripts/build_data.py [path/to/rr_work/outputs]
"""
import json, math, re, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "work" / "rr_work" / "outputs"
OUT = ROOT / "src" / "data" / "data.json"


def load(n):
    return pd.read_csv(SRC / f"{n}.csv")


def clean(v):
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def records(df):
    return [{k: clean(v) for k, v in r.items()} for r in df.to_dict("records")]


def original_payload():
    html = (SRC / "private_dashboard.html").read_text(encoding="utf-8")
    start = html.index("<script>") + len("<script>")
    js = html[start:]
    i = js.index("const D=") + len("const D=")
    obj, _ = json.JSONDecoder().raw_decode(js[i:])
    return obj


ids = load("player_identities").set_index("player_id")["name"].to_dict()
ranks = {"bat": load("bat_all_rankings"), "bowl": load("bowl_all_rankings")}
names = {int(k): v for k, v in ids.items()}
for df in ranks.values():
    for pid, n in zip(df.player_id, df.player):
        names[int(pid)] = n

ev = load("player_match_events")
agg = ev.groupby(
    ["role", "player_id", "match_id", "season_year", "competition", "phase", "pressure"], as_index=False
).agg(exposure=("exposure", "sum"), residual=("residual", "sum"), raw_value=("raw_value", "sum"))
events = {
    "role": [0 if r == "bat" else 1 for r in agg.role],
    "player_id": agg.player_id.astype(int).tolist(),
    "match_id": agg.match_id.astype(int).tolist(),
    "season": agg.season_year.astype(int).tolist(),
    "comp": [0 if c == "IPL" else 1 for c in agg.competition],
    "phase": [{"Powerplay": 0, "Middle": 1, "Death": 2}[p] for p in agg.phase],
    "pressure": agg.pressure.astype(int).tolist(),
    "exposure": agg.exposure.astype(float).tolist(),
    "residual": agg.residual.astype(float).tolist(),
}

orig = original_payload()
out = {
    "audit": json.load(open(SRC / "audit_summary.json")),
    "names": names,
    "ranks": {r: records(df) for r, df in ranks.items()},
    "events": events,
    "eventLegend": {"role": ["bat", "bowl"], "comp": ["IPL", "T20I"], "phase": ["Powerplay", "Middle", "Death"]},
    "outcomes": records(load("player_outcome_evidence")),
    "seasonEvidence": records(
        load("player_season_evidence")[
            ["player_id", "role", "season_year", "pressure_events", "pressure_matches", "rating", "eligible"]
        ]
    ),
    "metrics": records(load("model_metrics")),
    "calibration": records(load("calibration")),
    "calibrationSummary": records(load("calibration_summary")),
    "sensitivity": records(load("sensitivity_summary")),
    "repeat": records(load("future_repeatability")),
    "fit": records(load("RR_fit_and_transferability")),
    "targets": records(load("conditional_RR_targets")),
    "squad": records(load("official_RR_published_squad")),
    "explorer": orig["explorer"],
    "splits": records(load("temporal_splits")),
    "selected": json.load(open(SRC / "validation_selected_models.json")),
    "coverage": records(load("coverage")),
    "phasePatterns": records(load("phase_patterns")),
}
OUT.parent.mkdir(parents=True, exist_ok=True)
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("wrote", OUT, OUT.stat().st_size // 1024, "KB; event rows", len(agg))
