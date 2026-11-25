import Link from "next/link";
import VoiceAssistantFAB from "@/components/VoiceAssistantFAB";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 flex flex-col pb-32 font-sans">
      
      {/* 1. TOP UTILITY BAR */}
      <div className="bg-[#002b4f] text-white text-[10px] sm:text-xs py-1 px-4 flex justify-between items-center hidden md:flex">
        <div>Wednesday, April 1, 2026</div>
        <div className="flex space-x-2 items-center">
          <span className="cursor-pointer hover:text-yellow-300 transition">A-</span>
          <span className="cursor-pointer hover:text-yellow-300 transition">A</span>
          <span className="cursor-pointer hover:text-yellow-300 transition">A+</span>
          <div className="bg-white text-black px-2 py-0.5 rounded ml-2 cursor-pointer text-[10px] font-bold">High Contrast</div>
        </div>
      </div>

      {/* 2. MAIN HEADER */}
      <header className="bg-[#004b87] text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center border-b-[3px] border-yellow-500">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#004b87] font-bold text-xs shadow-inner">WB</div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold uppercase tracking-wide">Department of Food & Supplies</h1>
            <p className="text-xs md:text-sm text-blue-200">Government of West Bengal</p>
          </div>
        </div>
        <div className="bg-white text-black px-3 py-1 text-xs font-bold rounded cursor-pointer border-2 border-blue-900 shadow-sm">
          Language / ভাষা ▼
        </div>
      </header>

      {/* 3. COMPLEX 3-COLUMN LAYOUT */}
      <div className="flex flex-col xl:flex-row max-w-[1400px] mx-auto w-full mt-4 px-2 gap-4">
        
        {/* --- LEFT SIDEBAR (The Massive List) --- */}
        <aside className="w-full xl:w-72 flex-shrink-0 bg-white border border-gray-300 shadow-sm h-fit">
          <div className="bg-[#00aeef] text-white font-bold p-3 text-sm flex justify-between items-center uppercase">
            Citizen's Home <span className="bg-red-500 text-[10px] px-1.5 py-0.5 rounded animate-pulse">NEW</span>
          </div>
          <ul className="text-[11px] font-bold text-blue-900 divide-y divide-gray-200 uppercase">
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">📄 Self service for Ration Card</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🤝 Apply for FPS on Compassionate Ground</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🚚 Apply for Distributorship</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🏪 Apply for FPS Dealership</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">📋 Procedure to obtain Ration Card</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🌾 PADDY PROCUREMENT</li>
            
            
            
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🔙 want to surrender your ration card ?</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">👥 Recruitment</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🏬 FPS (RATION SHOP)</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">📝 TENDERS</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">⛽ PETROLEUM PRODUCTS LICENSING/NOC</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">📱 MOBILE APP</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🏢 DISTRIBUTORS / WHOLESALERS</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">💬 WHATSAPP CHAT BOT</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">⚠️ ePOS Complaint App</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">📥 Download official letter format</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🗺️ View Stakeholders Location In MAP</li>
            
            {/* THE NEWLY BURIED AND CAMOUFLAGED MANUAL LINK */}
            <Link href="/services/ration-card" className="block">
              <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2 transition-colors">
                💳 Ration card Dashboard
              </li>
            </Link>

            

            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">👨‍💼 Recruitment - Paddy Purchase Officer</li>
            <li className="py-4 px-4 hover:bg-sky-50 cursor-pointer flex items-center gap-2">🛢️ KEROSENE</li>
          </ul>
        </aside>

        {/* --- CENTER CONTENT (MASSIVE DASHBOARD) --- */}
        <div className="flex-1 flex flex-col space-y-4">
          
          {/* Notice Board Tabs */}
          <div className="bg-white border border-gray-300 shadow-sm">
            <div className="flex text-xs font-bold text-center border-b border-gray-300">
              <div className="flex-1 bg-blue-900 text-white p-2.5 cursor-pointer">Notices</div>
              <div className="flex-1 bg-gray-100 text-blue-900 p-2.5 cursor-pointer hover:bg-gray-200 transition">Press Releases</div>
              <div className="flex-1 bg-gray-100 text-blue-900 p-2.5 cursor-pointer hover:bg-gray-200 transition">Govt Order</div>
            </div>
            <div className="p-4 text-sm text-blue-700 h-24 overflow-y-auto bg-blue-50/30">
              <ul className="list-disc pl-4 space-y-2">
                <li><a href="#" className="hover:underline font-medium">Application for new distributorship/wholesaleship</a></li>
                <li><a href="#" className="hover:underline font-medium">Important update regarding Kharif Marketing Season</a></li>
              </ul>
            </div>
          </div>

          {/* Huge Complex Dashboard Area */}
          <div className="bg-white border border-gray-300 p-5 shadow-sm text-center">
            <h2 className="text-xl font-bold text-blue-900 mb-6 tracking-widest uppercase underline decoration-2 underline-offset-4">Dashboard</h2>
            
            {/* Row 1: Ration card related */}
            <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Ration card related</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {[
                { title: "Total active cards", val: "8,93,25,861" },
                { title: "Aadhaar linked cards", val: "8,81,05,548" },
                { title: "Linked in last 30 days", val: "1,551" },
                { title: "Mobile linked family", val: "2,50,68,974" }
              ].map((stat, i) => (
                <div key={i} className="bg-[#009b8c] text-white p-3 rounded shadow-sm hover:shadow-md transition">
                  <p className="text-[10px] md:text-xs mb-1 leading-tight opacity-90">{stat.title}</p>
                  <p className="text-sm md:text-lg font-bold">{stat.val}</p>
                </div>
              ))}
            </div>

            {/* Row 2: Application for ration card related services */}
            <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Application for ration card related services <span className="font-normal text-xs text-gray-500">(Since 1st January 2021)</span></h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {[
                { title: "Total application submitted", val: "3,05,77,811" },
                { title: "Total application approved", val: "2,70,01,402" },
                { title: "Total application rejected", val: "23,21,446" },
                { title: "Total application disposed", val: "2,93,22,848" }
              ].map((stat, i) => (
                <div key={i} className="bg-[#1f8000] text-white p-3 rounded shadow-sm hover:shadow-md transition">
                  <p className="text-[10px] md:text-xs mb-1 leading-tight opacity-90">{stat.title}</p>
                  <p className="text-sm md:text-lg font-bold">{stat.val}</p>
                </div>
              ))}
            </div>

            {/* Row 3: Allocation and distribution */}
            <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Allocation and distribution</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {[
                { title: "Total transactions this month", val: "28,66,259" },
                { title: "Beneficiaries lifted ration this month", val: "1,19,48,383", sub: "(13.68 %)" },
                { title: "Total ration shops", val: "21,207" },
                { title: "Total Distributors", val: "529" }
              ].map((stat, i) => (
                <div key={i} className="bg-[#008751] text-white p-3 rounded shadow-sm hover:shadow-md transition">
                  <p className="text-[10px] md:text-xs mb-1 leading-tight opacity-90">{stat.title}</p>
                  <p className="text-sm md:text-lg font-bold">{stat.val}</p>
                  {stat.sub && <p className="text-[10px] font-medium opacity-80">{stat.sub}</p>}
                </div>
              ))}
            </div>

            {/* Row 4: Transaction related */}
            <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Transaction related</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {[
                { title: "Aadhaar authenticated transactions", val: "28,66,098", sub: "(99.99 %)" },
                { title: "Finger print authenticated transactions", val: "26,84,483", sub: "(93.66% )" },
                { title: "Iris authenticated transactions", val: "1,31,353", sub: "(4.58% )" },
                { title: "OTP authenticated transactions", val: "50,262", sub: "(1.75%)" }
              ].map((stat, i) => (
                <div key={i} className="bg-[#006040] text-white p-3 rounded shadow-sm hover:shadow-md transition">
                  <p className="text-[10px] md:text-xs mb-1 leading-tight opacity-90">{stat.title}</p>
                  <p className="text-sm md:text-lg font-bold">{stat.val}</p>
                  {stat.sub && <p className="text-[10px] font-medium opacity-80">{stat.sub}</p>}
                </div>
              ))}
            </div>

            {/* Row 5: Paddy Procurement */}
            <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Paddy Procurement: KMS 2025-26</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {[
                { title: "Registered Farmers", val: "31,21,185" },
                { title: "Farmers benefited", val: "20,51,048" },
                { title: "Paddy procured (MT)", val: "45,19,436" },
                { title: "Procurement centres", val: "2,197" }
              ].map((stat, i) => (
                <div key={i} className="bg-[#277400] text-white p-3 rounded shadow-sm hover:shadow-md transition">
                  <p className="text-[10px] md:text-xs mb-1 leading-tight opacity-90">{stat.title}</p>
                  <p className="text-sm md:text-lg font-bold">{stat.val}</p>
                </div>
              ))}
            </div>

            <button className="w-full bg-[#007bff] text-white text-sm font-bold py-3 rounded shadow hover:bg-blue-700 transition tracking-wide mt-2">
              Ease of Doing Business Portal
            </button>
          </div>
        </div>

        {/* --- RIGHT SIDEBAR --- */}
        <aside className="w-full xl:w-56 flex-shrink-0 flex flex-col gap-4 h-fit">
          <div className="bg-white border border-gray-300 shadow-sm">
            <div className="bg-[#004b87] text-white font-bold p-3 text-sm flex items-center justify-between">
              LOGINS & PORTALS
              <span className="text-xs">🔒</span>
            </div>
            <ul className="text-xs font-semibold text-white divide-y divide-gray-100">
              <li className="p-3.5 bg-[#006040] hover:opacity-90 cursor-pointer transition">WBPDS PORTAL</li>
              <li className="p-3.5 bg-[#009b8c] hover:opacity-90 cursor-pointer transition">OFFICERS LOG IN</li>
              <li className="p-3.5 bg-[#277400] hover:opacity-90 cursor-pointer transition">TENDER / EOI</li>
              <li className="p-3.5 bg-[#00aeef] hover:opacity-90 cursor-pointer transition">E-PADDY</li>
              <li className="p-3.5 bg-[#331188] hover:opacity-90 cursor-pointer transition">SRMS PORTAL</li>
            </ul>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 p-4 rounded text-center shadow-sm">
            <p className="text-xs font-bold text-blue-900 mb-2">Need Help?</p>
            <p className="text-[10px] text-gray-600 mb-2">Chat with Khadya Sathi Bot</p>
            <button className="bg-blue-600 text-white text-xs px-4 py-2 rounded-full hover:bg-blue-700 transition">Start Chat</button>
          </div>
        </aside>
      </div>

      {/* 5. FOOTER */}
      <footer className="bg-[#002b4f] text-white text-center p-6 mt-auto text-xs border-t-4 border-[#009b8c]">
        <p className="font-medium tracking-wide">📍 Khadya Bhavan, 11A, Mirza Ghalib Street, Kolkata - 700087</p>
        <p className="mt-2 font-bold text-sm text-yellow-400 tracking-wider">Toll-Free Helpline: 1800-345-5505 / 1967</p>
        <div className="mt-4 pt-4 border-t border-blue-800/50 flex flex-col items-center justify-center gap-2">
          <p className="text-[10px] text-gray-400">© Copyright 2026. All Rights Reserved. Department of Food & Supplies, Government of West Bengal.</p>
          <p className="text-[10px] text-gray-500">Visitor Counter: 2603238 | Last Updated: Mar 31 2026 2:00PM</p>
        </div>
      </footer>

      <VoiceAssistantFAB />
    </main>
  );
}