import { NextResponse } from 'next/server';
import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

// ==========================================
// CONFIG
// ==========================================
const ALLOWED_ROUTES = [
  "/",
  "/services/apply-ration",
  "/services/link-aadhaar",
  "/services/ration-card",
  "/services/status",
];

const MIN_AUDIO_BYTES = 1000;       // blocks empty ~300-byte WebM containers
const WHISPER_TIMEOUT_MS = 8000;    // audio transcription timeout guard
const LLM_TIMEOUT_MS = 4000;        // circuit breaker: per-request timeout
const BREAKER_THRESHOLD = 3;        // consecutive failures before the breaker opens
const BREAKER_COOLDOWN_MS = 30_000; // how long the breaker stays open

// Circuit-breaker state (per server instance)
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

// ==========================================
// EVALUATION HOOKS (inactive unless EVAL_MODE=1)
// ==========================================
// Used only by scripts/eval to run ablation and fault-injection experiments.
// With EVAL_MODE unset, every x-eval-* header and eval_transcript field is ignored.
const EVAL_MODE = process.env.EVAL_MODE === '1';

type AblationFlag = 'normalizer' | 'labellock' | 'fallback' | 'whitelist';
type FaultMode = 'none' | 'timeout' | 'error' | 'malformed' | 'hallucinate';

type EvalOptions = {
  enabled: boolean;
  ablate: Set<AblationFlag>;
  fault: FaultMode;
  transcript: string | null;
};

const ABLATION_FLAGS: readonly AblationFlag[] = ['normalizer', 'labellock', 'fallback', 'whitelist'];
const FAULT_MODES: readonly FaultMode[] = ['none', 'timeout', 'error', 'malformed', 'hallucinate'];
const HALLUCINATED_ROUTE = "/services/apply-new-ration-card-online";

function readEvalOptions(request: Request, formData: FormData): EvalOptions {
  const off: EvalOptions = { enabled: false, ablate: new Set(), fault: 'none', transcript: null };
  if (!EVAL_MODE) return off;

  if (request.headers.get('x-eval-reset-breaker') === '1') {
    consecutiveFailures = 0;
    breakerOpenUntil = 0;
  }

  const ablate = new Set<AblationFlag>();
  for (const part of (request.headers.get('x-eval-ablate') ?? '').split(',')) {
    const flag = part.trim().toLowerCase();
    const known = ABLATION_FLAGS.find((f) => f === flag);
    if (known) ablate.add(known);
  }

  const faultHeader = (request.headers.get('x-eval-fault') ?? 'none').trim().toLowerCase();
  const fault = FAULT_MODES.find((f) => f === faultHeader) ?? 'none';

  const t = formData.get('eval_transcript');
  const transcript = typeof t === 'string' && t.trim() !== '' ? t : null;

  return { enabled: true, ablate, fault, transcript };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Detects numeric PII in what is about to be sent to the LLM: raw vault values,
// any remaining run of 6+ digits, or a run of 4+ spelled-out digit words.
const SPOKEN_DIGIT = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";
const SPOKEN_DIGIT_RUN = new RegExp(`\\b${SPOKEN_DIGIT}(?:[\\s,.-]+${SPOKEN_DIGIT}){3,}\\b`, 'i');

function detectPiiLeak(
  messages: { role: string; content: string }[],
  vault: Map<string, string>
): boolean {
  const payload = messages
    .filter((m) => m.role !== 'system')
    .map((m) => m.content)
    .join('\n');
  const payloadDigits = payload.replace(/\D/g, ' ');

  for (const raw of vault.values()) {
    const digits = raw.replace(/\D/g, '');
    if (payload.includes(raw) || (digits.length >= 6 && payloadDigits.includes(digits))) return true;
  }
  if (/\d(?:[-.,\s]{0,2}\d){5,}/.test(payload)) return true;
  return SPOKEN_DIGIT_RUN.test(payload);
}

type AiResponse = {
  type: string;
  target: string;
  answer: string;
  entities: Record<string, string>;
};

const SYSTEM_PROMPT = `
You are the Deep-Linking Routing and Q&A Agent for the West Bengal Food & Supplies portal.

KNOWLEDGE BASE:
- Office hours: Monday to Friday, 10:00 AM to 5:30 PM. Closed on weekends.
- Toll-free helpline: 1800-345-5505 or 1967.
- Head office: Khadya Bhavan, 11A Mirza Ghalib Street, Kolkata.

AVAILABLE URL ROUTES (Deep Links):
- "/" (Home / Dashboard)
- "/services/apply-ration" (Applying for a brand new ration card)
- "/services/link-aadhaar" (Linking Aadhaar with an existing Ration Card)
- "/services/ration-card" (Viewing the general Ration Card Services dashboard)
- "/services/status" (Checking application status)

RESPONSE RULES:
You MUST respond with a valid JSON object.
You MUST include exactly four keys: "type", "target", "entities", and "answer".
NEVER leave a key name blank.

ENTITIES EXTRACTION:
Extract ALL masked number tokens ("__NUM_TOKEN_0__", "__NUM_TOKEN_1__", etc.) into ONLY these three keys based on the label spoken before each token:
1. "phone" (number labeled phone or mobile)
2. "aadhaar_no" (number labeled Aadhaar)
3. "ration_no" (number labeled ration card or application)

Populate ALL mentioned slots simultaneously in "entities". Never put a phone token into "aadhaar_no" or "ration_no".

CORRECTION LOOP (STATE MEMORY):
You will receive the recent conversation history. If the user says something like "No, the other one" or "I meant apply", look at the history to understand what they are correcting, and route them to the new correct target.

SCENARIO 1: Apply for a new ration card with phone and Aadhaar.
{
  "type": "navigation",
  "target": "/services/apply-ration",
  "entities": {
    "phone": "__NUM_TOKEN_1__",
    "aadhaar_no": "__NUM_TOKEN_0__",
    "ration_no": ""
  },
  "answer": "none"
}

SCENARIO 2: Link Aadhaar with ration card and phone.
{
  "type": "navigation",
  "target": "/services/link-aadhaar",
  "entities": {
    "phone": "__NUM_TOKEN_0__",
    "aadhaar_no": "__NUM_TOKEN_1__",
    "ration_no": "__NUM_TOKEN_2__"
  },
  "answer": "none"
}

SCENARIO 3: Factual Q&A (type "qa", target "none").
{
  "type": "qa",
  "target": "none",
  "entities": { "phone": "", "aadhaar_no": "", "ration_no": "" },
  "answer": "The office is open Monday to Friday, 10:00 AM to 5:30 PM."
}
`;

// ==========================================
// HELPERS
// ==========================================

// Acoustic Normalizer:
// 1. Spoken repeat expansion: "double five" -> "55", "triple zero" -> "000"
// 2. Spelled-out digit runs: "nine eight three three ..." -> "9833..." (4+ consecutive digit tokens only,
//    so ordinary phrases like "one ration card" are left alone). Without this step, numbers that
//    Whisper writes as words would slip past maskPII and reach the LLM unmasked.
const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

function normalizeAcoustics(text: string): string {
  const expanded = text.replace(/(double|triple)\s*([a-z]+|\d)/gi, (match: string, modifier: string, val: string) => {
    const digit = DIGIT_WORDS[val.toLowerCase()] ?? val;
    if (!/^\d$/.test(digit)) return match;
    return modifier.toLowerCase() === 'double' ? digit.repeat(2) : digit.repeat(3);
  });

  const token = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|\\d+)";
  const run = new RegExp(`\\b${token}(?:[\\s,.-]+${token}){3,}\\b`, 'gi');
  return expanded.replace(run, (match: string) => {
    const parts = match.split(/[\s,.-]+/).filter(Boolean);
    if (!parts.some((p) => /^[a-z]+$/i.test(p))) return match; // pure digit runs are already maskable
    return parts.map((p) => DIGIT_WORDS[p.toLowerCase()] ?? p).join('');
  });
}

// PII Privacy Shield: masks any 6–13 digit sequence with a neutral token so length never misleads slot mapping
function maskPII(text: string, vault: Map<string, string>): string {
  return text.replace(/\b(?:\d[-.,\s]{0,2}){5,12}\d\b/g, (match: string) => {
    const token = `__NUM_TOKEN_${vault.size}__`;
    vault.set(token, match);
    return token;
  });
}

// Normalizes Indian mobile numbers (handles 10-digit, leading 0, +91, and 11-digit Whisper trailing stutter)
function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  if (d.length === 11) return d.slice(0, 10);
  return "";
}

// Deterministic closest-label slot extractor: maps each masked token by the label spoken right before it
function extractLabeledEntities(
  safeTranscript: string,
  vault: Map<string, string>
): { entities: Record<string, string>; claimedRawDigits: Set<string> } {
  const entities: Record<string, string> = {};
  const claimedRawDigits = new Set<string>();
  const tokenMatches = [...safeTranscript.matchAll(/__NUM_TOKEN_\d+__/g)];
  let prevEnd = 0;

  const lastPos = (segment: string, re: RegExp): number => {
    let pos = -1;
    for (const m of segment.matchAll(re)) {
      pos = m.index ?? pos;
    }
    return pos;
  };

  for (const match of tokenMatches) {
    const tok = match[0];
    const start = match.index ?? 0;
    const before = safeTranscript.slice(prevEnd, start).toLowerCase();
    prevEnd = start + tok.length;

    const rawDigits = (vault.get(tok) ?? "").replace(/\D/g, "");
    if (!rawDigits) continue;

    const candidates: { slot: "phone" | "aadhaar_no" | "ration_no"; pos: number }[] = [];
    const phonePos = lastPos(before, /\b(?:phone|mobile|contact|cell)\b/g);
    const aadhaarPos = lastPos(before, /\b(?:aadhaar|aadhar|adhar|uid|other card)\b/g);
    const rationPos = lastPos(before, /\b(?:ration|application|doc|wbrc)\b/g);

    if (phonePos >= 0) candidates.push({ slot: "phone", pos: phonePos });
    if (aadhaarPos >= 0) candidates.push({ slot: "aadhaar_no", pos: aadhaarPos });
    if (rationPos >= 0) candidates.push({ slot: "ration_no", pos: rationPos });

    if (candidates.length === 0) continue;

    // Pick the label closest to this token
    candidates.sort((a, b) => b.pos - a.pos);
    const winner = candidates[0].slot;

    if (winner === "phone" && !entities.phone) {
      const phone = normalizePhone(rawDigits);
      if (phone) {
        entities.phone = phone;
        claimedRawDigits.add(rawDigits);
      }
    } else if (winner === "aadhaar_no" && !entities.aadhaar_no) {
      if (rawDigits.length >= 9 && rawDigits.length <= 12) {
        entities.aadhaar_no = rawDigits;
        claimedRawDigits.add(rawDigits);
      }
    } else if (winner === "ration_no" && !entities.ration_no) {
      if (rawDigits.length >= 6 && rawDigits.length <= 12) {
        entities.ration_no = rawDigits;
        claimedRawDigits.add(rawDigits);
      }
    }
  }

  return { entities, claimedRawDigits };
}

// Client-supplied history is untrusted: whitelist roles, cap size, mask PII
function sanitizeHistory(raw: unknown, vault: Map<string, string>, normalize = true) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { role: "user" | "assistant"; content: string } => {
      if (!m || typeof m !== "object") return false;
      const item = m as Record<string, unknown>;
      return (
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
      );
    })
    .slice(-6)
    .map((m) => ({
      role: m.role,
      content: maskPII(normalize ? normalizeAcoustics(m.content.slice(0, 500)) : m.content.slice(0, 500), vault),
    }));
}

// Deterministic local router: last-resort fallback when the LLM is down or unparseable
function keywordRouter(text: string): AiResponse | null {
  const t = text.toLowerCase();
  const nav = (target: string): AiResponse => ({
    type: "navigation",
    target,
    answer: "none",
    entities: {},
  });
  const qa = (answer: string): AiResponse => ({
    type: "qa",
    target: "none",
    answer,
    entities: {},
  });

  // Q&A patterns are checked first but are deliberately narrow, so navigation phrases such as
  // "open the status page", "where is my application status" or "my contact number is ..." are not captured.
  if (/\b(helpline|toll[- ]?free|customer care|support number)\b|\b(whom|who) (do i|should i|can i) call\b/.test(t)) {
    return qa("The toll-free helpline is 1800-345-5505 or 1967.");
  }
  if (/\b(office hours?|working hours?|opening hours?|timings?)\b|\bwhen (is|does) (the )?office (open|close)\b|\b(is|are) (the )?office (open|closed)\b/.test(t)) {
    return qa("Office hours are Monday to Friday, 10 AM to 5:30 PM. Closed on weekends.");
  }
  if (/\b(address|head office|khadya bhavan)\b|\bwhere is (the )?(food|office|department)\b|\boffice (is )?located\b/.test(t)) {
    return qa("The head office is at Khadya Bhavan, 11A Mirza Ghalib Street, Kolkata.");
  }

  // "status"/"track" wins over "get ... ration card" so "get the status of my ration card" is not routed to apply
  if (/\b(status|track|tracking)\b/.test(t)) return nav("/services/status");
  if (/\b(apply|new|make|get)\b.*\b(ration|card)\b|\bration\b.*\b(apply|new|make)\b/.test(t)) return nav("/services/apply-ration");
  if (/\b(aadhaar|aadhar|adhar|link|seed|seeding|e-?kyc)\b/.test(t)) return nav("/services/link-aadhaar");
  if (/\bcheck\b/.test(t)) return nav("/services/status");
  if (/ration card services|services/.test(t)) return nav("/services/ration-card");
  if (/home|dashboard|main page/.test(t)) return nav("/");
  return null;
}

// Glitch-Catcher: strict JSON first, deterministic regex extraction second
function parseLLMOutput(content: string, allowRegex = true): { response: AiResponse | null; parseOk: boolean } {
  const base: AiResponse = {
    type: "unknown",
    target: "none",
    answer: "I couldn't find the answer to that.",
    entities: {},
  };

  try {
    const clean = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);

    let target = parsed.target;
    if (!target && parsed[""]) target = parsed[""];

    base.type = String(parsed.type || "unknown").toLowerCase().trim();
    base.target = typeof target === 'string' ? target.trim() : "none";
    base.answer = parsed.answer && parsed.answer !== "none" ? String(parsed.answer) : base.answer;
    base.entities = parsed.entities && typeof parsed.entities === 'object' ? parsed.entities : {};
    return { response: base, parseOk: true };
  } catch {
    if (!allowRegex) return { response: null, parseOk: false };
    console.error("JSON Parsing Failed. Falling back to Regex.");
    const typeMatch = content.match(/"type"\s*:\s*"?([^",\n}]+)"?/i);
    const targetMatch = content.match(/"target"\s*:\s*"?([^",\n}]+)"?/i);
    const answerMatch = content.match(/"answer"\s*:\s*"([^"\n}]+)"/i);
    const phoneMatch = content.match(/"phone"\s*:\s*"([^"\n}]*)"/i);
    const aadhaarMatch = content.match(/"aadhaar(?:_no)?"\s*:\s*"([^"\n}]*)"/i);
    const rationMatch = content.match(/"ration_no"\s*:\s*"([^"\n}]*)"/i);

    base.type = typeMatch ? typeMatch[1].toLowerCase().trim() : "unknown";
    base.target = targetMatch ? targetMatch[1].trim() : "none";
    base.answer = answerMatch && answerMatch[1] !== "none" ? answerMatch[1] : base.answer;
    base.entities = {
      phone: phoneMatch ? phoneMatch[1] : "",
      aadhaar_no: aadhaarMatch ? aadhaarMatch[1] : "",
      ration_no: rationMatch ? rationMatch[1] : "",
    };
    return { response: base, parseOk: false };
  }
}

// Entities end up in a URL query string: accept digits only, with slot-specific normalization
function sanitizeEntities(e: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const phone = normalizePhone(String(e?.phone ?? e?.mobile ?? ""));
  const aadhaar = String(e?.aadhaar_no ?? e?.aadhaar ?? e?.aadhar ?? "").replace(/\D/g, "");
  const ration = String(e?.ration_no ?? e?.application_no ?? "").replace(/\D/g, "");

  if (phone) out.phone = phone;
  if (aadhaar.length >= 9 && aadhaar.length <= 12) out.aadhaar_no = aadhaar;
  if (ration.length >= 6 && ration.length <= 12) out.ration_no = ration;
  return out;
}

// Telemetry: one CSV row per request (no transcript, no PII)
async function logTelemetry(row: (string | number | boolean)[]) {
  try {
    const dir = path.join(process.cwd(), 'logs');
    const file = path.join(dir, 'telemetry.csv');
    await mkdir(dir, { recursive: true });
    if (!existsSync(file)) {
      await appendFile(
        file,
        'timestamp,whisper_ms,llm_ms,total_ms,source,parse_ok,breaker,type,final_route,pii_count,pii_leak,mode\n'
      );
    }
    await appendFile(file, row.join(',') + '\n');
  } catch (e) {
    console.error("Telemetry write failed (read-only filesystem?):", e);
  }
}

// ==========================================
// ROUTE HANDLER
// ==========================================
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const evalOpts = readEvalOptions(request, formData);
    const ablated = (flag: AblationFlag) => evalOpts.ablate.has(flag);

    const audioFile = formData.get('file') as Blob | null;
    const usingEvalTranscript = evalOpts.transcript !== null;

    if (!usingEvalTranscript && (!audioFile || audioFile.size < MIN_AUDIO_BYTES)) {
      return NextResponse.json({ error: "Empty or too-short audio file" }, { status: 400 });
    }

    const piiVault = new Map<string, string>();

    let rawHistory: unknown = [];
    try {
      const historyString = formData.get('history') as string;
      rawHistory = historyString ? JSON.parse(historyString) : [];
    } catch {
      rawHistory = [];
    }
    const history = sanitizeHistory(rawHistory, piiVault, !ablated('normalizer'));

    const t0 = performance.now();
    let transcript: string;

    if (usingEvalTranscript) {
      // Text-only evaluation: skips ASR so the reasoning stage can be measured on fixed transcripts
      transcript = evalOpts.transcript ?? "";
    } else {
      const fileBuffer = await (audioFile as Blob).arrayBuffer();
      const cleanBlob = new Blob([fileBuffer], { type: 'audio/webm' });

      // ==========================================
      // PHASE 1: THE EARS (Groq Whisper Translations)
      // ==========================================
      const groqFormData = new FormData();
      groqFormData.append('file', cleanBlob, 'audio.webm');
      groqFormData.append('model', 'whisper-large-v3');
      groqFormData.append('response_format', 'json');

      const whisperController = new AbortController();
      const whisperTimer = setTimeout(() => whisperController.abort(), WHISPER_TIMEOUT_MS);
      let groqResponse: Response;

      try {
        groqResponse = await fetch('https://api.groq.com/openai/v1/audio/translations', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
          body: groqFormData,
          signal: whisperController.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.error(`[Groq Audio API Error] Timed out after ${WHISPER_TIMEOUT_MS}ms`);
          return NextResponse.json({ error: "Groq Audio API Timed Out" }, { status: 504 });
        }
        throw err;
      } finally {
        clearTimeout(whisperTimer);
      }

      if (!groqResponse.ok) {
        const errorText = await groqResponse.text();
        console.error(`[Groq Audio API Error] Status: ${groqResponse.status}`);
        return new Response(
          JSON.stringify({ error: "Groq Audio API Failed", details: errorText }),
          { status: groqResponse.status, headers: { "Content-Type": "application/json" } }
        );
      }

      const groqData: { text?: string } = await groqResponse.json();
      transcript = groqData.text ?? "";
    }

    if (!transcript || transcript.trim() === "") {
      return NextResponse.json({ transcript: "", target: "unknown" });
    }

    const t1 = performance.now();

    // ==========================================
    // ACOUSTIC NORMALIZER ("double five" -> "55", spelled-out digit runs -> digits)
    // ==========================================
    let safeTranscript = ablated('normalizer') ? transcript : normalizeAcoustics(transcript);

    // ==========================================
    // PII PRIVACY SHIELD
    // ==========================================
    const historyPiiCount = piiVault.size;
    safeTranscript = maskPII(safeTranscript, piiVault);
    const currentTurnPiiCount = piiVault.size - historyPiiCount;
    console.log(`[Privacy Shield] Masked: "${safeTranscript}" (${currentTurnPiiCount} item(s) masked this turn)`);

    const llmMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: safeTranscript },
    ];
    const piiLeak = detectPiiLeak(llmMessages, piiVault);
    if (piiLeak) console.warn("[Privacy Shield] Possible unmasked number in LLM payload");

    // ==========================================
    // PHASE 2: THE BRAIN, wrapped in a circuit breaker
    // ==========================================
    let aiResponse: AiResponse | null = null;
    let source: 'llm' | 'regex' | 'keyword' | 'none' = 'llm';
    let parseOk = false;
    let llmRawTarget = "none";
    const breakerState = Date.now() < breakerOpenUntil ? 'open' : 'closed';

    if (breakerState === 'closed') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      try {
        if (evalOpts.fault === 'timeout') {
          await sleep(LLM_TIMEOUT_MS);
          throw new Error(`[Eval fault] LLM timed out after ${LLM_TIMEOUT_MS}ms`);
        }
        if (evalOpts.fault === 'error') {
          throw new Error("[Eval fault] Groq LLM API Failed (503)");
        }

        const llmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: llmMessages,
            temperature: 0.1,
            max_completion_tokens: 512,
            reasoning_effort: "low",
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        if (!llmResponse.ok) {
          const errorText = await llmResponse.text();
          throw new Error(`Groq LLM API Failed (${llmResponse.status}): ${errorText}`);
        }

        const llmData: { choices?: { message?: { content?: string } }[] } = await llmResponse.json();
        let content: string = llmData.choices?.[0]?.message?.content ?? "";
        if (!content.trim()) {
          throw new Error("Groq LLM returned empty content");
        }

        if (evalOpts.fault === 'malformed') {
          // Schema drift: Markdown fence, trailing comma and a missing closing brace
          content = "```json\n" + content.trim().replace(/\}\s*$/, "").replace(/"\s*$/, '",') + "\n```";
        }

        consecutiveFailures = 0;
        const result = parseLLMOutput(content, !ablated('fallback'));
        aiResponse = result.response;
        parseOk = result.parseOk;
        source = parseOk ? 'llm' : (aiResponse ? 'regex' : 'none');

        if (aiResponse && evalOpts.fault === 'hallucinate' && aiResponse.type === 'navigation') {
          aiResponse.target = HALLUCINATED_ROUTE;
        }
        llmRawTarget = aiResponse?.target ?? "none";
      } catch (err) {
        console.error("LLM call failed, using keyword fallback:", err);
        consecutiveFailures++;
        if (consecutiveFailures >= BREAKER_THRESHOLD) {
          breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
          consecutiveFailures = 0;
          console.error(`Circuit breaker OPEN for ${BREAKER_COOLDOWN_MS / 1000}s`);
        }
        aiResponse = null;
      } finally {
        clearTimeout(timer);
      }
    }

    // Fallback tier: LLM unavailable, breaker open, or output unusable
    if (!aiResponse || (aiResponse.type !== 'navigation' && aiResponse.type !== 'qa')) {
      const local = ablated('fallback') ? null : keywordRouter(safeTranscript);
      if (local) {
        aiResponse = local;
        source = 'keyword';
      } else if (!aiResponse) {
        aiResponse = {
          type: "qa",
          target: "none",
          answer: "Sorry, I could not understand that. Please try again.",
          entities: {},
        };
        source = 'none';
      }
    }

    // ==========================================
    // DE-TOKENIZATION + LABEL-LOCKED ENTITY MERGE
    // ==========================================
    const detok = (s: string) =>
      s.replace(/__NUM_TOKEN_\d+__/g, (tok) => piiVault.get(tok) ?? "");

    const detokLLMEntities: Record<string, string> = {};
    for (const [k, v] of Object.entries(aiResponse.entities || {})) {
      if (typeof v === 'string') detokLLMEntities[k] = detok(v);
    }

    if (aiResponse.type === 'navigation') {
      // 1. Deterministic closest-label extraction takes priority (prevents phone/Aadhaar swaps)
      const { entities: labeled, claimedRawDigits } = ablated('labellock')
        ? { entities: {} as Record<string, string>, claimedRawDigits: new Set<string>() }
        : extractLabeledEntities(safeTranscript, piiVault);
      const finalEntities: Record<string, string> = { ...labeled };
      const usedValues = new Set(Object.values(finalEntities));

      // 2. Merge any unlabeled slots returned by the LLM without duplicating already-claimed numbers
      const llmSanitized = sanitizeEntities(detokLLMEntities);
      for (const [slot, val] of Object.entries(llmSanitized)) {
        const rawFromLLM = String(detokLLMEntities[slot] ?? "").replace(/\D/g, "");
        if (!finalEntities[slot] && !usedValues.has(val) && !claimedRawDigits.has(rawFromLLM)) {
          finalEntities[slot] = val;
          usedValues.add(val);
        }
      }

      aiResponse.entities = finalEntities;
    } else {
      aiResponse.entities = {};
    }

    aiResponse.answer = detok(aiResponse.answer);

    // ==========================================
    // ROUTE WHITELIST
    // ==========================================
    if (aiResponse.type === 'navigation') {
      if (!ablated('whitelist') && !ALLOWED_ROUTES.includes(aiResponse.target)) {
        console.warn(`Blocked non-whitelisted target: "${aiResponse.target}"`);
        aiResponse = {
          type: "qa",
          target: "none",
          answer: "Sorry, I couldn't find that service. Please try again.",
          entities: {},
        };
      }
    } else {
      aiResponse.target = "none";
    }

    const t2 = performance.now();
    const whisperMs = Math.round(t1 - t0);
    const llmMs = Math.round(t2 - t1);
    const totalMs = Math.round(t2 - t0);
    console.log(`[Orchestration] Total: ${totalMs}ms | Ears: ${whisperMs}ms | Brain: ${llmMs}ms | source: ${source}`);

    await logTelemetry([
      new Date().toISOString(),
      whisperMs,
      llmMs,
      totalMs,
      source,
      parseOk,
      breakerState,
      aiResponse.type,
      aiResponse.target,
      currentTurnPiiCount,
      piiLeak,
      evalOpts.enabled ? 'eval' : 'live',
    ]);

    return NextResponse.json({
      transcript: transcript,
      type: aiResponse.type,
      target: aiResponse.target,
      answer: aiResponse.answer,
      entities: aiResponse.entities,
      ...(evalOpts.enabled
        ? {
            eval: {
              source,
              parse_ok: parseOk,
              breaker: breakerState,
              llm_raw_target: llmRawTarget,
              whisper_ms: whisperMs,
              llm_ms: llmMs,
              total_ms: totalMs,
              pii_count: currentTurnPiiCount,
              pii_leak: piiLeak,
              ablate: [...evalOpts.ablate],
              fault: evalOpts.fault,
            },
          }
        : {}),
    });

  } catch (error) {
    console.error("Orchestration Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
