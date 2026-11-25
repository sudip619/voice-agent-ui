"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import VoiceAssistantFAB from "@/components/VoiceAssistantFAB";

function LinkAadhaarContent() {
  const searchParams = useSearchParams();

  const [aadhaarNo, setAadhaarNo] = useState("");
  const [rationNo, setRationNo] = useState("");
  const [phone, setPhone] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const urlAadhaar = (searchParams.get("aadhaar_no") || searchParams.get("aadhaar") || "").replace(/\D/g, "");
    const urlRation = (searchParams.get("ration_no") || "").replace(/\D/g, "");
    const urlPhone = (searchParams.get("phone") || searchParams.get("mobile") || "").replace(/\D/g, "");

    if (urlAadhaar) setAadhaarNo(urlAadhaar);
    if (urlRation) setRationNo(urlRation);
    if (urlPhone) setPhone(urlPhone);
    if (urlAadhaar || urlRation || urlPhone) {
      setAutoFilled(true);
      setStatusMessage(null);
    }
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aadhaarNo && !phone) {
      setStatusMessage("Please enter your 12-digit Aadhaar number and registered mobile number.");
      return;
    }
    setStatusMessage(
      `OTP verification sent for Aadhaar ${aadhaarNo || "(pending)"} linked with mobile ${phone || "(pending)"}.`
    );
  };

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col font-sans pb-32">
      <header className="bg-[#004b87] text-white p-4 shadow-md sticky top-0 z-10 flex items-center gap-4 border-b-[3px] border-yellow-500">
        <Link
          href="/services/ration-card"
          className="bg-white text-[#004b87] px-3 py-1.5 text-sm font-bold rounded shadow hover:bg-gray-200 transition"
        >
          ← Back to Services
        </Link>
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">Link Aadhaar with Ration Card</h1>
          <p className="text-xs text-blue-200">Department of Food &amp; Supplies</p>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-xl mx-auto bg-white rounded-lg shadow-lg p-6 md:p-8 border-t-4 border-[#00aeef]">
          <h2 className="text-2xl font-bold text-[#004b87] mb-2 uppercase">e-KYC Aadhaar Seeding</h2>
          <p className="text-sm text-gray-700 mb-6 font-medium">
            Enter your Aadhaar and registered mobile number to link with your Digital Ration Card.
          </p>

          {autoFilled && (
            <div className="mb-5 rounded bg-emerald-50 border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800">
              Voice Slot Filling: Form fields auto-populated from your voice command.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Aadhaar Number (12 digits)</label>
              <input
                type="text"
                maxLength={12}
                value={aadhaarNo}
                onChange={(e) => setAadhaarNo(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 123456789012"
                className="w-full border border-gray-400 bg-white rounded p-3 text-black font-bold outline-none focus:ring-2 focus:ring-[#00aeef] placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Registered Mobile Number (10 digits)</label>
              <input
                type="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 9876543210"
                className="w-full border border-gray-400 bg-white rounded p-3 text-black font-bold outline-none focus:ring-2 focus:ring-[#00aeef] placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Ration Card Number (Optional)</label>
              <input
                type="text"
                maxLength={12}
                value={rationNo}
                onChange={(e) => setRationNo(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 1234567890"
                className="w-full border border-gray-400 bg-white rounded p-3 text-black font-bold outline-none focus:ring-2 focus:ring-[#00aeef] placeholder-gray-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#004b87] text-white font-bold py-3.5 rounded shadow-md hover:bg-blue-800 transition tracking-wide mt-4"
            >
              Send Verification OTP
            </button>
          </form>

          {statusMessage && (
            <div className="mt-5 rounded bg-blue-50 border border-blue-200 p-4 text-sm font-semibold text-[#004b87]">
              {statusMessage}
            </div>
          )}
        </div>
      </div>

      <VoiceAssistantFAB />
    </main>
  );
}

export default function LinkAadhaarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100 p-8 text-center text-gray-600">Loading Aadhaar linking portal...</div>}>
      <LinkAadhaarContent />
    </Suspense>
  );
}