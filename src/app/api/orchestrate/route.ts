import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; 

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
- "/services/status" (Checking application status)

RESPONSE RULES:
You MUST respond with a valid JSON object.
You MUST include exactly four keys: "type", "target", "entities", and "answer". 
NEVER leave a key name blank.

ENTITIES EXTRACTION:
You MUST extract numbers into ONLY these two keys:
1. "phone"
2. "ration_no"
Do NOT invent new keys like "application_no". If it's a number, pick one of those two keys.

CORRECTION LOOP (STATE MEMORY):
You will receive the recent conversation history. If the user says something like "No, the other one" or "I meant apply", look at the history to understand what they are correcting, and route them to the new correct target.

CRITICAL TOKEN MAPPING RULES:
- If you see a masked token like "__PHONE_TOKEN_0__", you MUST put it in the "phone" key.
- If you see a masked token like "__ID_TOKEN_0__", you MUST put it in the "ration_no" key.

SCENARIO 1: The user wants to navigate to check their status with a phone number.
Output format:
{
  "type": "navigation",
  "target": "/services/status",
  "entities": {
    "phone": "__PHONE_TOKEN_0__",
    "ration_no": ""
  },
  "answer": "none"
}
`;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('file') as Blob;
    // 🚀 NEW: Parse the incoming history array
    const historyString = formData.get('history') as string;
    const history = historyString ? JSON.parse(historyString) : [];

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: "Empty audio file" }, { status: 400 });
    }

    const t0 = performance.now();
    const fileBuffer = await audioFile.arrayBuffer();
    
    // ==========================================
    // PHASE 1: THE EARS (Groq Whisper Translations) 
    // ==========================================
    const groqFormData = new FormData();
    groqFormData.append('file', audioFile, 'audio.webm'); 
    groqFormData.append('model', 'whisper-large-v3'); 
    groqFormData.append('response_format', 'json');
    // 🚀 FIX: Reverted to 'translations' so Bengali correctly translates to English meaning
    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/translations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: groqFormData
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error(`❌ [Groq API Error] Status: ${groqResponse.status}`);
      return new Response(
        JSON.stringify({ error: "Groq Audio API Failed", details: errorText }),
        { status: groqResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const groqData = await groqResponse.json();
    const transcript = groqData.text;

    if (!transcript || transcript.trim() === "") {
      return NextResponse.json({ transcript: "", target: "unknown" });
    }

    const t1 = performance.now();

    // ==========================================
    // 🧠 ADVANCE 3(a): ACOUSTIC NORMALIZER
    // ==========================================
    let safeTranscript = transcript;
    
    const digitMap: Record<string, string> = { 
      zero:"0", one:"1", two:"2", three:"3", four:"4", 
      five:"5", six:"6", seven:"7", eight:"8", nine:"9" 
    };
    
    safeTranscript = safeTranscript.replace(/(double|triple)\s*([a-z]+|\d)/gi, (match, modifier, val) => {
      const digit = digitMap[val.toLowerCase()] || val;
      if (!/^\d$/.test(digit)) return match;
      return modifier.toLowerCase() === 'double' ? digit + digit : digit + digit + digit;
    });

    // ==========================================
    // 🛡️ ADVANCE 2: PII PRIVACY SHIELD
    // ==========================================
    const piiVault = new Map<string, string>();
    let piiCounter = 0;

    // 1. Mask 11 to 12-digit IDs (e.g. Aadhaar/Ration)
    safeTranscript = safeTranscript.replace(/\b(?:\d[\-\.\s]?){10,11}\d\b/g, (match: string) => {
      const token = `__ID_TOKEN_${piiCounter++}__`;
      piiVault.set(token, match);
      return token;
    });

    // 2. Mask 9 to 10-digit Phone Numbers
    safeTranscript = safeTranscript.replace(/\b(?:\d[\-\.\s]?){8,9}\d\b/g, (match: string) => {
      const token = `__PHONE_TOKEN_${piiCounter++}__`;
      piiVault.set(token, match);
      return token;
    });

    console.log(`🔒 [Privacy Shield] Original: "${transcript}"`);
    console.log(`🔒 [Privacy Shield] Masked: "${safeTranscript}"`);

    // ==========================================
    // PHASE 2: THE BRAIN (Groq Llama / GPT-OSS) 🚀
    // ==========================================
    const llmResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b", 
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history, // 🚀 NEW: Inject the past context here!
          { role: "user", content: safeTranscript } 
        ],
        temperature: 0.1, 
        max_completion_tokens: 512, 
        response_format: { type: "json_object" }
      })
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("🚨 GROQ REJECTED THE REQUEST. DETAILS:", errorText);
      throw new Error(`Groq LLM API Failed. DETAILS: ${errorText}`);
    }

    const llmData = await llmResponse.json();
    const content = llmData.choices[0].message.content;

    let aiResponse: { type: string; target: string; answer: string; entities: Record<string, string> } = { 
      type: "unknown", 
      target: "none", 
      answer: "I could not generate an answer.", 
      entities: {} 
    };
    
    try {
      const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      
      let extractedTarget = parsed.target;
      if (!extractedTarget && parsed[""]) extractedTarget = parsed[""];

      aiResponse.type = parsed.type || "unknown";
      aiResponse.target = extractedTarget || "none";
      aiResponse.answer = parsed.answer && parsed.answer !== "none" ? parsed.answer : "I couldn't find the answer to that.";
      aiResponse.entities = parsed.entities || {};
      
    } catch (e) {
      console.error("JSON Parsing Failed. Falling back to Regex.");
      aiResponse.entities = {}; 
    }

    // ==========================================
    // 🛡️ DE-TOKENIZATION (Restoring the PII securely)
    // ==========================================
    if (aiResponse.entities) {
      Object.keys(aiResponse.entities).forEach(key => {
        const val = aiResponse.entities[key];
        if (typeof val === 'string' && piiVault.has(val)) {
          // Strip hyphens and spaces before sending to React frontend
          const cleanNumber = piiVault.get(val)?.replace(/[\-\.\s]/g, "") || "";
          aiResponse.entities[key] = cleanNumber;
        }
      });
    }

    const t2 = performance.now();
    console.log(`[Orchestration] Total: ${Math.round(t2 - t0)}ms | Ears: ${Math.round(t1 - t0)}ms | Brain: ${Math.round(t2 - t1)}ms`);

    return NextResponse.json({ 
      transcript: transcript, 
      type: aiResponse.type,
      target: aiResponse.target,
      answer: aiResponse.answer,
      entities: aiResponse.entities 
    });

  } catch (error) {
    console.error("Orchestration Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}