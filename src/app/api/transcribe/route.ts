import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('file') as Blob;

    // FIX 2: Check if the file is empty (Ghost Tap)
    if (!audioFile || audioFile.size === 0) {
      console.error("Received empty audio file.");
      return NextResponse.json({ error: "Empty audio file received" }, { status: 400 });
    }

    const groqFormData = new FormData();
    // FIX 1: You MUST provide 'audio.webm' as the 3rd argument, or Groq will reject it!
    groqFormData.append('file', audioFile, 'audio.webm'); 
    groqFormData.append('model', 'whisper-large-v3'); 
    groqFormData.append('response_format', 'json');

    console.log(`Transcribing audio via Groq LPU... (Size: ${audioFile.size} bytes)`);

    const response = await fetch('https://api.groq.com/openai/v1/audio/translations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}` // Make sure this key is in .env.local!
        // CRITICAL: Do NOT set 'Content-Type' header here. Fetch handles the multipart boundary automatically.
      },
      body: groqFormData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq ASR Error:", errorText);
      return NextResponse.json({ error: "Transcription failed" }, { status: response.status });
    }

    const data = await response.json();
    console.log("Transcription success:", data.text);
    
    return NextResponse.json({ transcript: data.text });

  } catch (error) {
    console.error("Transcription Server Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}