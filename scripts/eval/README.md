# Technical evaluation harness

Replays a labeled set of recorded utterances through `/api/orchestrate` under controlled
conditions (component ablations and injected LLM faults) and produces the paper's result tables.

## 1. Record the utterance set

**Use synthetic numbers only.** Speakers read phone, Aadhaar and ration numbers from the script,
never their own. This keeps real PII out of the dataset, the Groq API and the result files.

- Copy `manifest.template.csv` to `manifest.csv` and write one row per clip. Target: 150–300 clips,
  15+ speakers, roughly balanced across `en`, `bn`, `hi`, `bn-en`, `hi-en`.
- Mix utterance types: navigation with 0, 1, 2 and 3 numbers; Q&A; multi-turn corrections
  (`history_json`); numbers said with "double/triple", as digit words, and in groups.
- Columns:

| column | meaning |
|---|---|
| `clip_id` | unique id, also the audio file name |
| `speaker_id` | anonymous id (S01, S02, ...) |
| `language` | `en`, `bn`, `hi`, `bn-en`, `hi-en` |
| `audio_file` | path relative to the manifest, e.g. `clips/c001.webm` |
| `reference_text` | the script the speaker reads |
| `expected_type` | `navigation` or `qa` |
| `expected_route` | one of the 5 whitelisted routes (empty for `qa`) |
| `phone`, `aadhaar_no`, `ration_no` | digits that should be filled (empty if not spoken) |
| `history_json` | optional prior turns, JSON array of `{role, content}` |
| `text_input` | optional English text for `--mode text` (defaults to `reference_text`) |

- Record on phones or laptops in ordinary rooms (some background noise is realistic). Save raw
  files as `raw/<clip_id>.<ext>`, then convert to the browser's format:

```bash
bash scripts/eval/prepare_audio.sh scripts/eval/raw scripts/eval/clips
```

`raw/`, `clips/` and `manifest.csv` are git-ignored.

## 2. Run

```bash
# terminal 1 — eval hooks are inactive unless EVAL_MODE=1
EVAL_MODE=1 npm run dev

# terminal 2
node scripts/eval/run_eval.mjs --manifest scripts/eval/manifest.csv --mode audio --limit 5   # smoke test
node scripts/eval/run_eval.mjs --manifest scripts/eval/manifest.csv --mode audio            # full run
node scripts/eval/run_eval.mjs --manifest scripts/eval/manifest.csv --mode text             # ASR-free run
```

- `--mode audio` is the real pipeline (Whisper + LLM). `--mode text` sends `text_input` straight
  to the reasoning stage, which isolates ASR errors from reasoning errors.
- `--repeat 3` re-runs every clip to measure LLM run-to-run variance (temperature is 0.1, not 0).
- Add `--conditions fault_timeout,fault_timeout_no_fallback` for the timeout experiment
  (each request waits the full 4 s timeout, so it is slow).
- Groq rate limits: increase `--delay` if you see HTTP 429 in the results.

Never run a production deployment with `EVAL_MODE=1`.

## 3. Analyze

```bash
python3 scripts/eval/analyze.py logs/eval/results-audio-<stamp>.jsonl logs/eval/results-text-<stamp>.jsonl
```

Outputs Markdown tables plus `*.by_condition.csv`, `*.by_language.csv` and `*.errors.csv`
(failed clips in the full system, for the error-analysis section).

## Conditions

| condition | what is switched off / injected | what it shows |
|---|---|---|
| `full` | nothing | headline accuracy and latency |
| `no_normalizer` | "double five" and digit-word conversion | normalizer's effect on slot accuracy **and** PII leakage |
| `no_labellock` | closest-label slot binding (LLM-only slots) | effect on phone/Aadhaar swaps |
| `no_fallback` | regex tier and keyword router | what the fallback tiers add with a healthy LLM |
| `fault_malformed` (`_no_fallback`) | LLM output corrupted (fence, trailing comma, missing brace) | regex Glitch-Catcher recovery |
| `fault_error` (`_no_fallback`) | LLM API returns an error on every call | circuit breaker + keyword router under outage |
| `fault_timeout` (`_no_fallback`) | LLM hangs past the 4 s timeout | timeout + breaker latency behavior |
| `fault_hallucinate` (`_no_whitelist`) | LLM navigation target replaced with a non-existent route | route whitelist |

## Metrics (per condition)

- **task_success**: correct type and route, and every expected slot exactly right with no wrong
  extra slot; with a 95% Wilson confidence interval.
- **intent_acc / route_acc**: type correct / type and route correct.
- **slot_exact**: per-slot exact match; **all_slots_ok**: all slots right, over clips with numbers.
- **swap_rate**: clips where a number landed in another slot's field (e.g. phone in Aadhaar).
- **broken_route**: navigation to a route outside the whitelist (a 404 for the citizen).
- **pii_leak**: requests where a raw 6+ digit run or 4+ spelled-out digits reached the LLM payload.
- **src_***: share of answers produced by LLM JSON, regex recovery, keyword router, or none.
- **latency**: Whisper p50, LLM-stage p50, end-to-end p50/p95 (server-side).
