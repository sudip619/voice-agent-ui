import Link from "next/link";
import VoiceAssistantFAB from "@/components/VoiceAssistantFAB";

export default function ApplyRationCard() {
  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-[#004b87] text-white p-4 shadow-md sticky top-0 z-10 flex items-center gap-4">
        {/* Changed back link to go to the intermediate page! */}
        <Link href="/services/ration-card" className="bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded text-sm font-bold transition">
          ← Back to Services
        </Link>
        <div>
          <h1 className="text-xl font-bold">Form III: New Ration Card Application</h1>
          <p className="text-sm text-blue-200">Department of Food & Supplies</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto mt-10 p-8 bg-white rounded-xl shadow-md border border-gray-200">
        <h2 className="text-2xl font-bold text-[#004b87] mb-6 border-b pb-4">Applicant Details</h2>
        
        <form className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Head of Family Name</label>
              {/* text-gray-900 makes the typed text dark and readable */}
              <input type="text" className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 font-medium" placeholder="e.g. SUDIP MANDAL" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Aadhaar Number</label>
              <input type="text" className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 font-medium" placeholder="12-digit Aadhaar" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Complete Address</label>
            <textarea className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none h-24 placeholder-gray-400 font-medium" placeholder="Enter permanent address..."></textarea>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">District</label>
              <select className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white">
                <option value="" className="text-gray-400">Select District...</option>
                <option value="kolkata">Kolkata</option>
                <option value="howrah">Howrah</option>
                <option value="darjeeling">Darjeeling</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Mobile Number (For OTP)</label>
              <input type="tel" className="w-full text-gray-900 border border-gray-300 rounded p-3 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 font-medium" placeholder="+91" />
            </div>
          </div>

          <button type="button" className="w-full bg-[#00a676] hover:bg-green-600 text-white font-bold py-4 rounded-md mt-6 transition shadow-md text-lg">
            Submit Application
          </button>
        </form>
      </div>

      <VoiceAssistantFAB />
    </main>
  );
}