import { NextResponse } from 'next/server';

// This System Prompt defines the "Intelligence" of your navigation agent.
// It tells the LLM exactly what sections exist and how to behave.
const SYSTEM_PROMPT = `
You are a Cognitive Navigation Agent for a government portal. 
Your task is to analyze the user's voice transcript and determine which section they want to visit.

AVAILABLE SECTIONS:
1. "aadhaar" - Use this for anything related to ID cards, address updates, or biometrics.
2. "ration" - Use this for food subsidies, PDS, or ration card status.
3. "tax" - Use this for income tax, property tax, or revenue payments.

RESPONSE RULES:
- You must respond in STRICT JSON format.
- Keys: "target" (the string ID of the section) and "confidence" (0 to 1).
- If the user's intent matches none of the above, set target to "unknown".
- DO NOT include any conversational text. ONLY JSON.

Example Output: {"target": "aadhaar", "confidence": 0.98}
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transcript } = body;

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }

    // Calling the NVIDIA NIM API
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-super-120b-a12b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript }
        ],
        temperature: 0.1, // Low temperature ensures consistent, non-creative routing
        max_tokens: 50,
        response_format: { type: "json_object" } // NVIDIA-supported JSON forcing
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("NVIDIA API Error:", errorData);
      return NextResponse.json({ error: "NVIDIA API communication failed" }, { status: 502 });
    }

    const data = await response.json();
    
    // Extract the JSON content from the LLM's message
    const content = data.choices[0].message.content;
    let aiResponse;
    try {
      // 1. Sanitize: Remove markdown code blocks if the LLM injected them
      const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      // 2. Attempt strict parse
      aiResponse = JSON.parse(cleanContent);
      
    } catch (parseError) {
      console.warn("Strict JSON parsing failed. Falling back to Regex extraction. Raw string was:", content);
      
      // 3. Absolute Fallback: If it forgot a comma, just manually grab the target value
      const targetMatch = content.match(/"target"\s*:\s*"([^"]+)"/i);
      aiResponse = { 
        target: targetMatch ? targetMatch[1] : "unknown",
        confidence: 0.5 
      };
    }

    return NextResponse.json(aiResponse);

  } catch (error) {
    console.error("Internal Server Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}