"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateCurrentProfile } from "@/services/profile-service";
import { acceptResearchConsent } from "@/services/consent-service";
import type { Profile } from "@/types/dataset";

export default function ConsentPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => { getOrCreateCurrentProfile().then(setProfile); }, []);

  async function handleAccept() {
    if (!profile || !checked) return;
    await acceptResearchConsent(profile.profile_id);
    router.push("/student/dashboard");
  }

  return <main style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
    <h1>Research Consent</h1>
    <p>ระบบจะเก็บข้อมูลพฤติกรรมการเรียนรู้ เช่น session, event, attempt และ submission โดยใช้รหัสไม่ระบุตัวตน</p>
    <label><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> ยินยอมเข้าร่วมและให้ใช้ข้อมูลเพื่อการวิจัย</label>
    <br /><br />
    <button disabled={!checked} onClick={handleAccept}>Continue</button>
  </main>;
}
