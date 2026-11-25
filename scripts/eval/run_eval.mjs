#!/usr/bin/env node
// Replays a labeled utterance set through /api/orchestrate under several experimental conditions.
// Requires: Node 20+, the dev server running with EVAL_MODE=1 (see scripts/eval/README.md).
//
// Usage:
//   node scripts/eval/run_eval.mjs --manifest scripts/eval/manifest.csv --mode audio
//   node scripts/eval/run_eval.mjs --manifest scripts/eval/manifest.csv --mode text --conditions full,no_labellock
//
// Output: one JSON line per (condition, clip, repeat) in logs/eval/results-<mode>-<timestamp>.jsonl

import { readFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

// ---------- experimental conditions ----------
// ablate: components switched off; fault: failure injected into the LLM stage
const CONDITIONS = {
  full:                         { ablate: [],             fault: 'none' },
  no_normalizer:                { ablate: ['normalizer'], fault: 'none' },
  no_labellock:                 { ablate: ['labellock'],  fault: 'none' },
  no_fallback:                  { ablate: ['fallback'],   fault: 'none' },

  fault_malformed:              { ablate: [],             fault: 'malformed' },
  fault_malformed_no_fallback:  { ablate: ['fallback'],   fault: 'malformed' },
  fault_error:                  { ablate: [],             fault: 'error' },
  fault_error_no_fallback:      { ablate: ['fallback'],   fault: 'error' },
  fault_timeout:                { ablate: [],             fault: 'timeout' },
  fault_timeout_no_fallback:    { ablate: ['fallback'],   fault: 'timeout' },
  fault_hallucinate:            { ablate: [],             fault: 'hallucinate' },
  fault_hallucinate_no_whitelist: { ablate: ['whitelist'], fault: 'hallucinate' },
};

const DEFAULT_CONDITIONS = [
  'full', 'no_normalizer', 'no_labellock', 'no_fallback',
  'fault_malformed', 'fault_malformed_no_fallback',
  'fault_error', 'fault_error_no_fallback',
  'fault_hallucinate', 'fault_hallucinate_no_whitelist',
];
// fault_timeout* are opt-in: every LLM call waits the full 4 s timeout.

// ---------- args ----------
function parseArgs(argv) {
  const args = {
    manifest: 'scripts/eval/manifest.csv',
    mode: 'audio',
    conditions: DEFAULT_CONDITIONS.join(','),
    baseUrl: 'http://localhost:3000',
    repeat: 1,
    delay: 300,
    limit: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const val = argv[i + 1];
    if (key === 'manifest') args.manifest = val;
    else if (key === 'mode') args.mode = val;
    else if (key === 'conditions') args.conditions = val;
    else if (key === 'base-url') args.baseUrl = val;
    else if (key === 'repeat') args.repeat = Number(val);
    else if (key === 'delay') args.delay = Number(val);
    else if (key === 'limit') args.limit = Number(val);
    else if (key === 'help') { console.log(readHelp()); process.exit(0); }
    else { console.error(`Unknown argument --${key}`); process.exit(1); }
    i++;
  }
  if (!['audio', 'text'].includes(args.mode)) {
    console.error('--mode must be "audio" or "text"');
    process.exit(1);
  }
  return args;
}

function readHelp() {
  return `Options:
  --manifest PATH     labeled clip list (default scripts/eval/manifest.csv)
  --mode audio|text   audio = full pipeline incl. Whisper; text = reference_text, skips ASR
  --conditions LIST   comma list; available: ${Object.keys(CONDITIONS).join(', ')}
  --base-url URL      default http://localhost:3000
  --repeat N          runs per clip per condition (default 1)
  --delay MS          pause between requests to stay under rate limits (default 300)
  --limit N           only the first N clips (smoke test)`;
}

// ---------- minimal CSV parser (handles quoted fields) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  const [header, ...body] = rows;
  return body
    .filter((r) => !r[0].startsWith('#'))
    .map((r) => Object.fromEntries(header.map((h, j) => [h.trim(), (r[j] ?? '').trim()])));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendClip(args, clip, condition, resetBreaker, manifestDir) {
  const form = new FormData();
  if (args.mode === 'audio') {
    const audioPath = path.resolve(manifestDir, clip.audio_file);
    const bytes = await readFile(audioPath);
    form.append('file', new Blob([bytes], { type: 'audio/webm' }), 'audio.webm');
  } else {
    form.append('eval_transcript', clip.text_input || clip.reference_text);
  }
  if (clip.history_json) form.append('history', clip.history_json);

  const headers = {
    'x-eval-ablate': condition.ablate.join(','),
    'x-eval-fault': condition.fault,
  };
  if (resetBreaker) headers['x-eval-reset-breaker'] = '1';

  const started = performance.now();
  try {
    const res = await fetch(`${args.baseUrl}/api/orchestrate`, { method: 'POST', body: form, headers });
    const wallMs = Math.round(performance.now() - started);
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { http_status: res.status, wall_ms: wallMs, response: body };
  } catch (err) {
    return { http_status: 0, wall_ms: Math.round(performance.now() - started), response: null, error: String(err) };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const manifestDir = path.dirname(manifestPath);
  let clips = parseCsv(await readFile(manifestPath, 'utf8'));
  if (args.limit > 0) clips = clips.slice(0, args.limit);

  const conditionNames = args.conditions.split(',').map((c) => c.trim()).filter(Boolean);
  for (const name of conditionNames) {
    if (!CONDITIONS[name]) { console.error(`Unknown condition "${name}"`); process.exit(1); }
  }

  // Fail fast if the server is not in eval mode (eval block missing from the response)
  const probe = await sendClip(
    { ...args, mode: 'text' },
    { reference_text: 'what are the office hours', text_input: '', history_json: '' },
    CONDITIONS.full, true, manifestDir
  );
  if (probe.http_status !== 200 || !probe.response?.eval) {
    console.error('Server is not reachable or EVAL_MODE=1 is not set. Probe result:', JSON.stringify(probe));
    process.exit(1);
  }

  const outDir = path.resolve('logs/eval');
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `results-${args.mode}-${stamp}.jsonl`);

  const total = conditionNames.length * clips.length * args.repeat;
  let done = 0;
  console.log(`Running ${clips.length} clips x ${conditionNames.length} conditions x ${args.repeat} repeat(s) = ${total} requests`);
  console.log(`Writing to ${outFile}`);

  for (const name of conditionNames) {
    const condition = CONDITIONS[name];
    let first = true;
    for (let rep = 0; rep < args.repeat; rep++) {
      for (const clip of clips) {
        const result = await sendClip(args, clip, condition, first, manifestDir);
        first = false;
        const record = {
          condition: name,
          mode: args.mode,
          repeat: rep,
          clip_id: clip.clip_id,
          speaker_id: clip.speaker_id,
          language: clip.language,
          expected: {
            type: clip.expected_type,
            route: clip.expected_route,
            phone: clip.phone,
            aadhaar_no: clip.aadhaar_no,
            ration_no: clip.ration_no,
          },
          ...result,
        };
        await appendFile(outFile, JSON.stringify(record) + '\n');
        done++;
        if (done % 25 === 0 || done === total) process.stdout.write(`  ${done}/${total}\n`);
        if (args.delay > 0) await sleep(args.delay);
      }
    }
  }
  console.log(`Done. Analyze with:\n  python3 scripts/eval/analyze.py ${path.relative(process.cwd(), outFile)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
