#!/usr/bin/env python3
"""Turns run_eval.mjs output into the paper's result tables.

Usage:
    python3 scripts/eval/analyze.py logs/eval/results-audio-<stamp>.jsonl [more.jsonl ...]

Prints Markdown tables and writes CSVs next to the first input file:
    <name>.by_condition.csv   main comparison table (one row per condition)
    <name>.by_language.csv    'full' condition broken down by language
    <name>.errors.csv         every clip that failed in the 'full' condition, for error analysis

Standard library only.
"""
import csv
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

ALLOWED_ROUTES = {"/", "/services/apply-ration", "/services/link-aadhaar",
                  "/services/ration-card", "/services/status"}
SLOTS = ("phone", "aadhaar_no", "ration_no")


def digits(s):
    return "".join(ch for ch in (s or "") if ch.isdigit())


def wilson(k, n, z=1.96):
    """95% Wilson score interval for a proportion, returned as percentages."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (100 * max(0.0, centre - half), 100 * min(1.0, centre + half))


def percentile(values, q):
    if not values:
        return float("nan")
    v = sorted(values)
    idx = (len(v) - 1) * q
    lo, hi = math.floor(idx), math.ceil(idx)
    return v[lo] + (v[hi] - v[lo]) * (idx - lo)


def score(rec):
    """Scores one request against its ground truth."""
    exp = rec["expected"]
    resp = rec.get("response") or {}
    ok_http = rec.get("http_status") == 200 and isinstance(resp, dict) and "type" in resp
    got_type = resp.get("type", "") if ok_http else ""
    got_route = resp.get("target", "none") if ok_http else "none"
    ents = (resp.get("entities") or {}) if ok_http else {}
    ev = (resp.get("eval") or {}) if ok_http else {}

    exp_type = (exp.get("type") or "").strip().lower()
    intent_ok = ok_http and got_type == exp_type
    if exp_type == "navigation":
        route_ok = intent_ok and got_route == exp.get("route")
    else:
        route_ok = intent_ok  # Q&A: success = answered as Q&A without navigating

    slot_results = {}
    swaps = 0
    for slot in SLOTS:
        want = digits(exp.get(slot))
        got = digits(ents.get(slot))
        if want:
            slot_results[slot] = (got == want)
        elif got:
            slot_results[slot] = False  # spurious value in a slot that should be empty
        # swap: this slot holds a number that belongs to a different slot
        if got:
            for other in SLOTS:
                if other != slot and digits(exp.get(other)) == got and got != want:
                    swaps += 1

    slots_ok = all(slot_results.values()) if slot_results else True
    broken_route = ok_http and got_type == "navigation" and got_route not in ALLOWED_ROUTES

    return {
        "ok_http": ok_http,
        "intent_ok": intent_ok,
        "route_ok": route_ok,
        "slots_ok": slots_ok,
        "task_ok": route_ok and slots_ok,
        "slot_results": slot_results,
        "swaps": swaps,
        "has_slots": any(digits(exp.get(s)) for s in SLOTS),
        "broken_route": broken_route,
        "source": ev.get("source", "error" if not ok_http else "unknown"),
        "pii_leak": bool(ev.get("pii_leak")),
        "whisper_ms": ev.get("whisper_ms"),
        "llm_ms": ev.get("llm_ms"),
        "total_ms": ev.get("total_ms"),
        "wall_ms": rec.get("wall_ms"),
    }


def summarize(rows):
    n = len(rows)
    s = [r["_score"] for r in rows]
    k_task = sum(x["task_ok"] for x in s)
    slot_rows = [x for x in s if x["has_slots"]]
    slot_cells = [ok for x in s for ok in x["slot_results"].values()]
    totals = [x["total_ms"] for x in s if isinstance(x["total_ms"], (int, float))]
    llm = [x["llm_ms"] for x in s if isinstance(x["llm_ms"], (int, float))]
    whisper = [x["whisper_ms"] for x in s if isinstance(x["whisper_ms"], (int, float)) and x["whisper_ms"] > 0]
    src = Counter(x["source"] for x in s)
    lo, hi = wilson(k_task, n)
    pct = lambda k, d: (100.0 * k / d) if d else float("nan")
    return {
        "n": n,
        "task_success_%": pct(k_task, n),
        "task_success_ci95": f"[{lo:.1f}, {hi:.1f}]",
        "intent_acc_%": pct(sum(x["intent_ok"] for x in s), n),
        "route_acc_%": pct(sum(x["route_ok"] for x in s), n),
        "slot_exact_%": pct(sum(slot_cells), len(slot_cells)),
        "all_slots_ok_%": pct(sum(x["slots_ok"] for x in slot_rows), len(slot_rows)),
        "swap_rate_%": pct(sum(1 for x in slot_rows if x["swaps"] > 0), len(slot_rows)),
        "broken_route_%": pct(sum(x["broken_route"] for x in s), n),
        "http_error_%": pct(sum(not x["ok_http"] for x in s), n),
        "pii_leak_%": pct(sum(x["pii_leak"] for x in s), n),
        "src_llm_%": pct(src.get("llm", 0), n),
        "src_regex_%": pct(src.get("regex", 0), n),
        "src_keyword_%": pct(src.get("keyword", 0), n),
        "src_none_%": pct(src.get("none", 0), n),
        "whisper_p50_ms": percentile(whisper, 0.5),
        "llm_p50_ms": percentile(llm, 0.5),
        "total_p50_ms": percentile(totals, 0.5),
        "total_p95_ms": percentile(totals, 0.95),
    }


def fmt(v):
    if isinstance(v, float):
        return "–" if math.isnan(v) else f"{v:.1f}"
    return str(v)


def print_table(title, key_name, table):
    if not table:
        return
    cols = list(next(iter(table.values())).keys())
    print(f"\n### {title}\n")
    print("| " + " | ".join([key_name] + cols) + " |")
    print("|" + "---|" * (len(cols) + 1))
    for key, row in table.items():
        print("| " + " | ".join([key] + [fmt(row[c]) for c in cols]) + " |")


def write_csv(path, key_name, table):
    if not table:
        return
    cols = list(next(iter(table.values())).keys())
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow([key_name] + cols)
        for key, row in table.items():
            w.writerow([key] + [fmt(row[c]) for c in cols])


def main(paths):
    records = []
    for p in paths:
        with open(p) as f:
            records.extend(json.loads(line) for line in f if line.strip())
    if not records:
        sys.exit("No records found.")
    for r in records:
        r["_score"] = score(r)

    by_cond = defaultdict(list)
    for r in records:
        by_cond[f'{r["condition"]} ({r["mode"]})'].append(r)
    cond_table = {k: summarize(v) for k, v in by_cond.items()}

    full = [r for r in records if r["condition"] == "full"]
    by_lang = defaultdict(list)
    for r in full:
        by_lang[f'{r.get("language") or "?"} ({r["mode"]})'].append(r)
    lang_table = {k: summarize(v) for k, v in sorted(by_lang.items())}

    print_table("Results by condition", "condition", cond_table)
    print_table("Full system, by language", "language", lang_table)

    out = Path(paths[0])
    stem = out.with_suffix("")
    write_csv(f"{stem}.by_condition.csv", "condition", cond_table)
    write_csv(f"{stem}.by_language.csv", "language", lang_table)

    # Error list for the full system (transcripts here contain the synthetic test numbers only)
    with open(f"{stem}.errors.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["mode", "clip_id", "language", "expected_route", "got_type", "got_route",
                    "expected_slots", "got_slots", "source", "transcript"])
        for r in full:
            s = r["_score"]
            if s["task_ok"]:
                continue
            resp = r.get("response") or {}
            exp = r["expected"]
            w.writerow([r["mode"], r["clip_id"], r.get("language"), exp.get("route"),
                        resp.get("type"), resp.get("target"),
                        json.dumps({k: exp.get(k) for k in SLOTS if exp.get(k)}),
                        json.dumps(resp.get("entities") or {}),
                        s["source"], resp.get("transcript", "")])
    print(f"\nCSV written: {stem}.by_condition.csv, {stem}.by_language.csv, {stem}.errors.csv")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
