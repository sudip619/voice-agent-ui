"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import VoiceAssistantFAB from "@/components/VoiceAssistantFAB";

export default function StatusCheckPage() {
  const searchParams = useSearchParams();
  
  // React State for form inputs
  const [phone, setPhone] = useState("");
  const [rationNo, setRationNo] = useState("");

  // Auto-fill form fields if URL parameters exist from Voice Agent
  useEffect(() => {
    // Check for "phone", but also catch "mobile" if the LLM invents it
    const urlPhone = searchParams.get("phone") || searchParams.get("mobile");
    
    // Catch everything else for the document number and set it to rationNo
    const urlDocNumber = searchParams.get("ration_no") || searchParams.get("application_no") || searchParams.get("doc_no"); 

    if (urlPhone) setPhone(urlPhone);
    if (urlDocNumber) setRationNo(urlDocNumber); // 🚀 THE FIX: Changed from setDocNumber to setRationNo
  }, [searchParams]);

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col font-sans">
      
      {/* 1. NAVIGATION HEADER (Consistent with Home Page) */}
      <header className="bg-[#004b87] text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center border-b-[3px] border-yellow-500">
        <div className="flex items-center gap-4">
          {/* MANUAL BACK BUTTON */}
          <Link href="/">
            <button className="bg-white text-[#004b87] px-3 py-1.5 text-sm font-bold rounded shadow hover:bg-gray-200 transition flex items-center gap-1">
              <span>&larr;</span> Back to Home
            </button>
          </Link>
          
          <div className="hidden md:block">
            <h1 className="text-lg font-bold uppercase tracking-wide">Department of Food & Supplies</h1>
          </div>
        </div>
        <div className="bg-white text-black px-3 py-1 text-xs font-bold rounded cursor-pointer border-2 border-blue-900 shadow-sm">
          Language / ভাষা ▼
        </div>
      </header>

      {/* 2. MAIN FORM CONTENT */}
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-xl mx-auto bg-white rounded-lg shadow-lg p-6 md:p-8 border-t-4 border-[#009b8c]">
          <h2 className="text-2xl font-bold text-[#004b87] mb-2 uppercase">Check Application Status</h2>
          <p className="text-sm text-gray-700 mb-6 font-medium">Enter your details below to track your application.</p>
          
          <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
            
            {/* Phone Number Input */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Registered Mobile Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full border border-gray-400 bg-white rounded p-3 text-black font-bold outline-none focus:ring-2 focus:ring-[#009b8c] transition-shadow placeholder-gray-500"
              />
            </div>

            {/* Ration Card Number Input */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">
                Ration Card Number (Optional)
              </label>
              <input
                type="text"
                value={rationNo}
                onChange={(e) => setRationNo(e.target.value)}
                placeholder="e.g. WBRC123456"
                className="w-full border border-gray-400 bg-white rounded p-3 text-black font-bold outline-none focus:ring-2 focus:ring-[#009b8c] transition-shadow placeholder-gray-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-[#004b87] text-white font-bold py-3.5 rounded shadow-md hover:bg-blue-800 transition tracking-wide mt-4"
            >
              Check Status
            </button>
          </form>
        </div>
      </div>

      <VoiceAssistantFAB />
    </main>
  );
}