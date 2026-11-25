import Link from "next/link";
import VoiceAssistantFAB from "@/components/VoiceAssistantFAB";

export default function RationCardServices() {
  const services = [
    { title: "LINK AADHAAR WITH RATIONCARD", color: "bg-[#00aeef]", link: "/services/link-aadhaar" },
    { title: "LINK RATION CARD WITH MOBILE", color: "bg-[#008751]", link: "/services/link-aadhaar" },
    { title: "COMMON APPLICATION FORM", color: "bg-[#277400]", link: "#" },
    { title: "CHECK STATUS OF RATION CARD", color: "bg-[#009b8c]", link: "/services/status" },
    { title: "APPLY FOR NEW RATION CARD", color: "bg-[#291b72]", link: "/services/apply-ration" },
    { title: "VERIFY RATION CARD", color: "bg-[#331188]", link: "#" },
    { title: "GIVE UP SUBSIDY", color: "bg-[#1f8000]", link: "#" },
    { title: "NOTIFICATION", color: "bg-[#281c70]", link: "#" },
    { title: "DOWNLOAD APPLICATION FORM", color: "bg-[#287400]", link: "#" },
    { title: "E-RATION CARD", color: "bg-[#00aeef]", link: "#" },
    { title: "KNOW YOUR ENTITLEMENT", color: "bg-[#009b8c]", link: "#" },
    { title: "Ration Card Transaction Details", color: "bg-[#281c70]", link: "#" },
  ];

  return (
    <main className="min-h-screen bg-gray-100 pb-32">
      <header className="bg-[#004b87] text-white p-4 shadow-md sticky top-0 z-10 flex items-center gap-4">
        <Link href="/" className="bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded text-sm font-bold transition">
          ← Back to Home
        </Link>
        <div>
          <h1 className="text-xl font-bold">Ration Card Services Dashboard</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 mt-8 border-t-4 border-blue-600 bg-white shadow-sm rounded-lg">
        <h2 className="text-2xl text-blue-900 text-center font-bold mb-8 uppercase tracking-widest underline decoration-blue-300 underline-offset-8">
          Special Services
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((service, index) => (
            <Link
              key={index}
              href={service.link}
              className={`${service.color} text-white p-6 rounded shadow hover:scale-105 hover:shadow-lg transition transform flex items-center justify-center text-center font-bold text-sm min-h-[120px]`}
            >
              {service.title}
            </Link>
          ))}
        </div>
      </div>

      <VoiceAssistantFAB />
    </main>
  );
}