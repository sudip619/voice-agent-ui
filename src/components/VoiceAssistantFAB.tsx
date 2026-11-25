"use client";

import { useState, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useRouter } from "next/navigation"; // 🚀 Imported the Next.js Router

export default function VoiceAssistantFAB() {
  const { isRecording, startRecording, stopRecording, audioBlob } = useAudioCapture();
  const [status, setStatus] = useState<string>("");
  const router = useRouter(); // 🚀 Initialized the Router

  // 🚀 NEW: Short-term memory (stores the last interaction)
  const [sessionHistory, setSessionHistory] = useState<{role: string, content: string}[]>([]);

  useEffect(() => {
    if (!isRecording && audioBlob) {
      processVoiceCommand(audioBlob);
    }
  }, [isRecording, audioBlob]);

  const processVoiceCommand = async (blob: Blob) => {
    if (blob.size < 1000) {
      setStatus("Button pressed too quickly. Hold to speak.");
      setTimeout(() => setStatus(""), 3000);
      return; 
    }

    setStatus("Processing voice command..."); 

    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      // 🚀 NEW: Send the memory to the Edge API
      formData.append('history', JSON.stringify(sessionHistory));

      const response = await fetch('/api/orchestrate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error("Orchestration failed");

      const { transcript, target, type, answer, entities } = await response.json();
      
      console.log("🧠 NVIDIA BRAIN OUTPUT:", { type, target, answer, entities });

      if (!transcript) {
        setStatus("Didn't hear anything clearly.");
        setTimeout(() => setStatus(""), 3000);
        return;
      }

      const intentType = type ? type.toLowerCase() : "unknown";

      // ==========================================
      // INTENT 1: Q&A (Informational)
      // ==========================================
      
      if (intentType === "qa" && answer && answer !== "none") {
        setStatus(`🗣️ ${answer}`); 
        
        // ✨ THE 3 LINES OF ACCESSIBILITY MAGIC ✨
        const utterance = new SpeechSynthesisUtterance(answer);
        utterance.lang = 'en-IN'; // Forces an Indian English accent if available!
        window.speechSynthesis.speak(utterance);

        setTimeout(() => setStatus(""), 8000); 
        return; 
      } 

      // ==========================================
      // INTENT 2: DEEP LINK NAVIGATION (Actionable) 🚀
      // ==========================================
      setStatus(`" ${transcript} "`); 

      if (intentType === "navigation" && target && target !== "unknown" && target !== "none") {
        setTimeout(() => setStatus(`Teleporting to ${target}...`), 0);
        
        const navUtterance = new SpeechSynthesisUtterance("Teleporting to the selected service.");
        navUtterance.lang = 'en-IN';
        window.speechSynthesis.speak(navUtterance);
        
        // 🚀 NEW: Construct the URL with Query Parameters
        let finalDestination = target;
        
        if (entities && Object.keys(entities).length > 0) {
          const searchParams = new URLSearchParams();
          
          Object.entries(entities).forEach(([key, value]) => {
            // Only add valid strings that aren't empty or null
            if (typeof value === 'string' && value.trim() !== "") {
              searchParams.append(key, value.trim());
            }
          });
          
          const queryString = searchParams.toString();
          if (queryString) {
            finalDestination += `?${queryString}`;
          }
        }
        
        setTimeout(() => {
          // Push to the final URL containing the data slots
          router.push(finalDestination);
          setStatus("");
          
          // 🚀 NEW: Save this interaction so the LLM remembers it next time
          setSessionHistory([
            { role: "user", content: transcript },
            { role: "assistant", content: `I routed the user to ${finalDestination}.` }
          ]);
        }, 2000); // Give the user 2 seconds to read the message
        
      } else {
        setTimeout(() => {
          setStatus("Sorry, I couldn't find that section.");
          setTimeout(() => setStatus(""), 3000);
        }, 1500);
      }
    } catch (error) {
      console.error("API Error:", error);
      setStatus("Error processing voice command.");
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    startRecording();
    setStatus("Listening...");
  };

  const handleStop = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    stopRecording();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
      
      <div className="bg-white px-4 py-2 rounded-lg shadow-lg border border-blue-100 min-w-[200px] text-center animate-fade-in max-w-sm">
        <p className="text-sm font-medium text-blue-800">
          {status || "Ready for voice command"}
        </p>
      </div>

      <div className="relative flex items-center justify-center mr-2">
        {isRecording && (
          <>
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-30 animate-ping" />
            <span className="absolute inline-flex rounded-full bg-red-400 opacity-20 animate-ping" style={{ width: "calc(100% + 20px)", height: "calc(100% + 20px)", animationDelay: "0.3s", animationDuration: "1.2s" }} />
            <span className="absolute inline-flex rounded-full bg-red-400 opacity-10 animate-ping" style={{ width: "calc(100% + 40px)", height: "calc(100% + 40px)", animationDelay: "0.6s", animationDuration: "1.5s" }} />
          </>
        )}

        <button
          type="button"
          onMouseDown={handleStart}
          onMouseUp={handleStop}
          onMouseLeave={handleStop}
          onTouchStart={handleStart}
          onTouchEnd={handleStop}
          onContextMenu={(e) => e.preventDefault()}
          className={[
            "relative flex items-center justify-center w-16 h-16 rounded-full shadow-xl transition-all duration-200 ease-in-out active:scale-95 select-none touch-none",
            isRecording ? "bg-red-500 hover:bg-red-600 scale-110" : "bg-sky-500 hover:bg-sky-400 scale-100",
          ].join(" ")}
        >
          {isRecording ? <MicOff className="w-7 h-7 text-white" strokeWidth={2} /> : <Mic className="w-7 h-7 text-white" strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}