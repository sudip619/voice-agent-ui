"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import VoiceAssistantFAB from "@/components/VoiceAssistantFAB";

function ApplyRationContent() {
  const searchParams = useSearchParams();

  const urlPhone = (searchParams.get("phone") || searchParams.get("mobile") || "")
    .replace(/\D/g, "")
    .slice(0, 10);
  const urlAadhaar = (
    searchParams.get("aadhaar_no") ||
    searchParams.get("aadhaar") ||
    ""
  )
    .replace(/\D/g, "")
    .slice(0, 12);

  const [headName, setHeadName] = useState("");
  const [aadhaarNo, setAadhaarNo] = useState(urlAadhaar);
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState(urlPhone);
  const [autoFilled, setAutoFilled] = useState(Boolean(urlPhone || urlAadhaar));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (urlPhone) setPhone(urlPhone);
    if (urlAadhaar) setAadhaarNo(urlAadhaar);
    if (urlPhone || urlAadhaar) {
      setAutoFilled(true);
      setSubmitted(false);
    }
  }, [urlPhone, urlAadhaar]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-[#004b87] text-white p-4 shadow-md sticky top-0 z-10 flex items-center gap-4">
        <Link
          href="/services/ration-card"
          className="bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded text-sm font-bold transition"
        >
          ← Back to Services
        </Link>
        <div>
          <h1 className="text-xl font-bold">Form III: New Ration Card Application</h1>
          <p className="text-sm text-blue-200">Department of Food &amp; Supplies</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto mt-10 p-8 bg-white rounded-xl shadow-md border border-gray-200">
        <h2 className="text-2xl font-bold text-[#004b87] mb-6 border-b pb-4">Applicant Details</h2>

        {autoFilled && (
          <div className="mb-6 rounded bg-emerald-50 border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800">
            Voice Slot Filling: Mobile and Aadhaar numbers were pre-filled from your voice command.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Head of Family Name
              </label>
              <input
                type="text"
                value={headName}
                onChange={(e) => setHeadName(e.target.value)}
                className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 font-medium"
                placeholder="e.g. SUDIP MANDAL"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Aadhaar Number
              </label>
              <input
                type="text"
                maxLength={12}
                autoComplete="off"
                value={aadhaarNo}
                onChange={(e) => setAadhaarNo(e.target.value.replace(/\D/g, ""))}
                className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 font-medium"
                placeholder="12-digit Aadhaar"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Complete Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none h-24 placeholder-gray-400 font-medium"
              placeholder="Enter permanent address..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">District</label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white"
              >
                <option value="" className="text-gray-400">
                  Select District...
                </option>
                <option value="kolkata">Kolkata</option>
                <option value="howrah">Howrah</option>
                <option value="darjeeling">Darjeeling</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Mobile Number (For OTP)
              </label>
              <input
                type="tel"
                maxLength={10}
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 font-medium"
                placeholder="+91"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#00a676] hover:bg-green-600 text-white font-bold py-4 rounded-md mt-6 transition shadow-md text-lg"
          >
            Submit Application
          </button>
        </form>

        {submitted && (
          <div className="mt-6 rounded bg-emerald-50 border border-emerald-300 p-4 text-sm font-semibold text-emerald-900">
            Application submitted for {headName || "Applicant"} (Mobile: {phone || "Not provided"}, Aadhaar: {aadhaarNo || "Not provided"}).
          </div>
        )}
      </div>

      <VoiceAssistantFAB />
    </main>
  );
}

export default function ApplyRationCard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8 text-center text-gray-600">
          Loading application form...
        </div>
      }
    >
      <ApplyRationContent />
    </Suspense>
  );
}