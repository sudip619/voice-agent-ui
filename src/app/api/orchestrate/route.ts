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
function sanitizeHistory(raw: unknown, vault: Map<string, string>) {
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
      content: maskPII(m.content.slice(0, 500), vault),
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

  if (/helpline|toll|contact|call/.test(t)) return qa("The toll-free helpline is 1800-345-5505 or 1967.");
  if (/hour|timing|open|close/.test(t)) return qa("Office hours are Monday to Friday, 10 AM to 5:30 PM. Closed on weekends.");
  if (/address|office|where|located|head/.test(t)) return qa("The head office is at Khadya Bhavan, 11A Mirza Ghalib Street, Kolkata.");

  if (/(apply|new|make|get).*(ration|card)|ration.*(apply|new|make)/.test(t)) return nav("/services/apply-ration");
  if (/aadhaar|aadhar|adhar|link/.test(t)) return nav("/services/link-aadhaar");
  if (/status|track|check/.test(t)) return nav("/services/status");
  if (/ration card services|services/.test(t)) return nav("/services/ration-card");
  if (/home|dashboard|main page/.test(t)) return nav("/");
  return null;
}

// Glitch-Catcher: strict JSON first, deterministic regex extraction second
function parseLLMOutput(content: string): { response: AiResponse; parseOk: boolean } {
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
        'timestamp,whisper_ms,llm_ms,total_ms,source,parse_ok,breaker,type,final_route,pii_count\n'
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
    const audioFile = formData.get('file') as Blob;

    if (!audioFile || audioFile.size < MIN_AUDIO_BYTES) {
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
    const history = sanitizeHistory(rawHistory, piiVault);

    const t0 = performance.now();

    const fileBuffer = await audioFile.arrayBuffer();
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

    const groqData = await groqResponse.json();
    const transcript: string = groqData.text;

    if (!transcript || transcript.trim() === "") {
      return NextResponse.json({ transcript: "", target: "unknown" });
    }

    const t1 = performance.now();

    // ==========================================
    // ACOUSTIC NORMALIZER ("double five" -> "55")
    // ==========================================
    const digitMap: Record<string, string> = {
      zero: "0", one: "1", two: "2", three: "3", four: "4",
      five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    };

    let safeTranscript = transcript.replace(/(double|triple)\s*([a-z]+|\d)/gi, (match, modifier, val) => {
      const digit = digitMap[val.toLowerCase()] || val;
      if (!/^\d$/.test(digit)) return match;
      return modifier.toLowerCase() === 'double' ? digit + digit : digit + digit + digit;
    });

    // ==========================================
    // PII PRIVACY SHIELD
    // ==========================================
    const historyPiiCount = piiVault.size;
    safeTranscript = maskPII(safeTranscript, piiVault);
    const currentTurnPiiCount = piiVault.size - historyPiiCount;
    console.log(`[Privacy Shield] Masked: "${safeTranscript}" (${currentTurnPiiCount} item(s) masked this turn)`);

    // ==========================================
    // PHASE 2: THE BRAIN, wrapped in a circuit breaker
    // ==========================================
    let aiResponse: AiResponse | null = null;
    let source: 'llm' | 'regex' | 'keyword' | 'none' = 'llm';
    let parseOk = false;
    const breakerState = Date.now() < breakerOpenUntil ? 'open' : 'closed';

    if (breakerState === 'closed') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      try {
        const llmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...history,
              { role: "user", content: safeTranscript },
            ],
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

        const llmData = await llmResponse.json();
        const content: string = llmData.choices?.[0]?.message?.content ?? "";
        if (!content.trim()) {
          throw new Error("Groq LLM returned empty content");
        }

        consecutiveFailures = 0;
        const result = parseLLMOutput(content);
        aiResponse = result.response;
        parseOk = result.parseOk;
        source = parseOk ? 'llm' : 'regex';
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
      const local = keywordRouter(safeTranscript);
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
      const { entities: labeled, claimedRawDigits } = extractLabeledEntities(safeTranscript, piiVault);
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
      if (!ALLOWED_ROUTES.includes(aiResponse.target)) {
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
    ]);

    return NextResponse.json({
      transcript: transcript,
      type: aiResponse.type,
      target: aiResponse.target,
      answer: aiResponse.answer,
      entities: aiResponse.entities,
    });

  } catch (error) {
    console.error("Orchestration Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}