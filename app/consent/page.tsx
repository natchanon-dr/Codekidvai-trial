"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateCurrentProfile } from "@/services/profile-service";
import { acceptResearchConsent } from "@/services/consent-service";
import { getDashboardPathForRole } from "@/lib/role-redirect";
import type { Profile } from "@/types/dataset";

export default function ConsentPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getOrCreateCurrentProfile().then(setProfile); }, []);

  async function handleAccept() {
    if (!profile || !checked) return;
    setLoading(true);
    await acceptResearchConsent(profile.profile_id);
    router.push(getDashboardPathForRole(profile.role));
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#F37021] mb-4 shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Research Consent</h1>
          <p className="text-[#64748B] text-sm mt-1">Please review and accept before continuing</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] p-8">
          {/* Consent body */}
          <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-xl p-5 text-sm text-[#0F172A] leading-relaxed space-y-3 mb-6">
            <p className="font-semibold text-[#F37021]">ข้อมูลที่จะถูกเก็บรวบรวม</p>
            <p>
              ระบบจะเก็บข้อมูลพฤติกรรมการเรียนรู้ เช่น session, event, attempt และ submission
              โดยใช้รหัสไม่ระบุตัวตน เพื่อนำไปวิเคราะห์และพัฒนาการเรียนการสอนเท่านั้น
            </p>
            <ul className="list-disc list-inside space-y-1 text-[#64748B]">
              <li>การบันทึกการเริ่ม/จบ session การเรียน</li>
              <li>การบันทึก event เช่น การดูโจทย์ การส่งคำตอบ</li>
              <li>ผลการทำแบบฝึกหัด (attempt / submission)</li>
            </ul>
            <p className="text-[#64748B]">
              ข้อมูลทั้งหมดถูกเก็บในระบบที่ปลอดภัยและไม่สามารถระบุตัวตนของผู้เรียนได้
            </p>
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group mb-6">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${checked ? "bg-[#F37021] border-[#F37021]" : "border-[#FED7AA] bg-white group-hover:border-[#F37021]"}`}>
                {checked && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-[#0F172A] leading-snug">
              ยินยอมเข้าร่วมการวิจัยและให้ใช้ข้อมูลพฤติกรรมการเรียนรู้เพื่อการวิจัย
            </span>
          </label>

          <button
            disabled={!checked || loading}
            onClick={handleAccept}
            className="w-full py-2.5 px-4 bg-[#F37021] hover:bg-[#C2410C] disabled:bg-[#F37021]/40 text-white text-sm font-semibold rounded-xl transition shadow-sm cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? "กำลังดำเนินการ…" : "ยืนยันและดำเนินการต่อ"}
          </button>
        </div>
      </div>
    </main>
  );
}
