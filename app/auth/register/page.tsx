"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { createProfileForCurrentUser } from "@/services/profile-service";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setErrorMessage(error.message || JSON.stringify(error));
      setLoading(false);
      return;
    }

    if (!data.user) {
      setErrorMessage("User was not created.");
      setLoading(false);
      return;
    }

    if (!data.session) {
      setErrorMessage("Account created but no session. Please confirm email or disable email confirmation.");
      setLoading(false);
      return;
    }

    const profileResult = await createProfileForCurrentUser({
      display_name: displayName,
    }).catch((profileError) => {
      setErrorMessage(
        profileError?.message ||
          profileError?.error_description ||
          profileError?.details ||
          JSON.stringify(profileError)
      );
      return null;
    });

    setLoading(false);

    if (!profileResult) return;

    router.push("/consent");
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#F37021] mb-4 shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">KMITL Learning Research</h1>
          <p className="text-[#64748B] text-sm mt-1">Create your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#FED7AA] p-8">
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Display name
              </label>
              <input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-[#0F172A] placeholder-[#64748B] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Email address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-[#0F172A] placeholder-[#64748B] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-[#0F172A] placeholder-[#64748B] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] focus:border-transparent transition"
              />
            </div>

            {errorMessage && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#F37021] hover:bg-[#C2410C] disabled:bg-[#F37021]/60 text-white text-sm font-semibold rounded-xl transition shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-[#64748B] mt-6">
            Already have an account?{" "}
            <a href="/auth/login" className="text-[#F37021] hover:text-[#C2410C] font-medium transition">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
