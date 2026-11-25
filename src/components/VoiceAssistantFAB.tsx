"use client";

import { useState, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useRouter } from "next/navigation";

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function VoiceAssistantFAB() {
  const { isRecording, startRecording, stopRecording, audioBlob } = useAudioCapture();
  const [status, setStatus] = useState<string>("");
  const [sessionHistory, setSessionHistory] = useState<HistoryMessage[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!isRecording && audioBlob) {
      processVoiceCommand(audioBlob);
    }
  }, [isRecording, audioBlob]);

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    window.speechSynthesis.speak(utterance);
  };

  const appendHistory = (userText: string, assistantText: string) => {
    setSessionHistory((prev) => [
      ...prev.slice(-4),
      { role: "user", content: userText },
      { role: "assistant", content: assistantText },
    ]);
  };

  const processVoiceCommand = async (blob: Blob) => {
    if (blob.size < 1000) {
      setStatus("Button pressed too quickly. Hold to speak.");
      setTimeout(() => setStatus(""), 3000);
      return;
    }

    setStatus("Processing voice command...");

    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("history", JSON.stringify(sessionHistory.slice(-6)));

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Orchestration failed");

      const { transcript, target, type, answer, entities } = await response.json();

      if (!transcript) {
        setStatus("Didn't hear anything clearly.");
        setTimeout(() => setStatus(""), 3000);
        return;
      }

      const intentType = typeof type === "string" ? type.toLowerCase() : "unknown";

      // ==========================================
      // INTENT 1: Q&A (Informational & Fallbacks)
      // ==========================================
      if (intentType === "qa" && answer && answer !== "none") {
        setStatus(`🗣️ ${answer}`);
        speakText(answer);
        appendHistory(transcript, answer);

        setTimeout(() => setStatus(""), 8000);
        return;
      }

      // ==========================================
      // INTENT 2: DEEP LINK NAVIGATION (Actionable)
      // ==========================================
      setStatus(`" ${transcript} "`);

      if (intentType === "navigation" && target && target !== "unknown" && target !== "none") {
        let finalDestination = target;

        if (entities && typeof entities === "object" && Object.keys(entities).length > 0) {
          const searchParams = new URLSearchParams();

          Object.entries(entities).forEach(([key, value]) => {
            if (typeof value === "string" && value.trim() !== "") {
              searchParams.append(key, value.trim());
            }
          });

          const queryString = searchParams.toString();
          if (queryString) {
            finalDestination += `?${queryString}`;
          }
        }

        setStatus(`Teleporting to ${target}...`);
        speakText("Teleporting to the selected service.");
        appendHistory(transcript, `I routed the user to ${finalDestination}.`);

        setTimeout(() => {
          router.push(finalDestination);
          setStatus("");
        }, 2000);
      } else {
        const fallbackMsg = "Sorry, I couldn't find that service. Please try again.";
        setStatus(fallbackMsg);
        speakText(fallbackMsg);
        setTimeout(() => setStatus(""), 3500);
      }
    } catch (error) {
      console.error("API Error:", error);
      setStatus("Error processing voice command.");
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (isRecording) return;
    startRecording();
    setStatus("Listening...");
  };

  const handleStop = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isRecording) return;
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
            <span
              className="absolute inline-flex rounded-full bg-red-400 opacity-20 animate-ping"
              style={{
                width: "calc(100% + 20px)",
                height: "calc(100% + 20px)",
                animationDelay: "0.3s",
                animationDuration: "1.2s",
              }}
            />
            <span
              className="absolute inline-flex rounded-full bg-red-400 opacity-10 animate-ping"
              style={{
                width: "calc(100% + 40px)",
                height: "calc(100% + 40px)",
                animationDelay: "0.6s",
                animationDuration: "1.5s",
              }}
            />
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
          {isRecording ? (
            <MicOff className="w-7 h-7 text-white" strokeWidth={2} />
          ) : (
            <Mic className="w-7 h-7 text-white" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}