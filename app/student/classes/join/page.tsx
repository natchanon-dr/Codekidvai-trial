"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type JoinClassResponse = {
  error?: string;
  joined?: boolean;
  already_member?: boolean;
  class?: {
    class_code?: string | null;
    class_name?: string | null;
    class_level?: string | null;
  };
};

export default function StudentJoinClassPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim();
    if (!normalizedCode || loading) return;

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch("/api/student/classes/join", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_code: normalizedCode }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    setLoading(false);

    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to join class.");
      return;
    }

    const className = json.class?.class_name ?? json.class?.class_code ?? "class";
    setSuccessMessage(json.already_member ? `You are already enrolled in ${className}.` : `Joined ${className}.`);
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/student/dashboard" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Dashboard
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Join Class</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <section>
          <h1 className="text-2xl font-bold text-[#0F172A]">Join Class</h1>
          <p className="text-sm text-[#64748B] mt-1">Enter the class code or enrollment code shared by your teacher.</p>
        </section>

        <form onSubmit={joinClass} className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#64748B]">Class Code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="CLS26-000001"
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm font-mono font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />
          </label>

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
          {successMessage && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
              {successMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              type="submit"
              disabled={!code.trim() || loading}
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
            >
              {loading ? "Joining..." : "Join Class"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/student/dashboard")}
              className="px-4 py-2 rounded-xl border border-[#FED7AA] bg-white text-sm font-semibold text-[#64748B] hover:border-[#F37021]"
            >
              Back to Dashboard
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function safeJsonParse(text: string): JoinClassResponse {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
