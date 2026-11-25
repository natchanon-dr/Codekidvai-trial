"use client";

// ---------------------------------------------------------------------------
// BSSI Analysis — Behavioral–Sequential–Semantic Integration status (see
// docs/RESEARCHER_ANALYSIS_ARCHITECTURE_CONTRACT.md). Shows domain
// availability and which models consume which domain. Does NOT display a
// combined "BSSI/BSSM score" — none exists in Phase 4 (see the
// "Combined / Full BSSI" section below, status: not_implemented).
//
// BSSI = integration (feature/evidence construction). BSSM = the
// predictive model operating on BSSI Features. This page shows BSSI
// availability only — no BSSM has been trained yet.
//
// 2C3L is a separate assessment framework (see Assessment Analysis), not a
// fourth BSSI dimension — the conceptual flow below keeps them distinct.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { ResearcherBreadcrumb } from "@/app/researcher/_components/ResearcherBreadcrumb";

type Domain = {
  label: string;
  status: string;
  feature_count: number;
  features?: string[];
  model_usage: string[];
  description?: string;
  note?: string;
  circular_features?: string[];
  circular_reason?: string;
};

type Combined = { label: string; status: string; description: string; note: string; feature_count: number };

type MatrixRow = { model: string; uses_domain: Record<string, boolean>; trained: boolean };

type Payload = {
  evaluation_purpose: string;
  label_validity: string;
  confirmatory_analysis_allowed: boolean;
  data_warning: string;
  framework: string;
  framework_note: string;
  conceptual_flow: string;
  conceptual_flow_note: string;
  domains: { behavioral: Domain; sequential: Domain; tag_based: Domain; semantic: Domain };
  combined: Combined;
  model_domain_matrix: MatrixRow[];
};

const STATUS_STYLE: Record<string, string> = {
  implemented: "bg-green-100 text-green-700 border-green-200",
  deferred: "bg-amber-100 text-amber-700 border-amber-200",
  not_implemented: "bg-gray-100 text-gray-600 border-gray-200",
};

const DOMAIN_ORDER: Array<keyof Payload["domains"]> = ["behavioral", "sequential", "tag_based", "semantic"];
const DOMAIN_COLUMN_LABEL: Record<string, string> = {
  behavioral: "Behavioral",
  sequential: "Sequential",
  tag_based: "TAG-based",
  semantic: "Semantic",
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style}`}>{status}</span>;
}

function DomainCard({ domain }: { domain: Domain }) {
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-white p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#0F172A]">{domain.label}</p>
        <StatusPill status={domain.status} />
      </div>
      <p className="text-xs text-[#64748B]">
        {domain.feature_count} feature{domain.feature_count !== 1 ? "s" : ""}
        {domain.model_usage.length > 0 && <> · used by {domain.model_usage.join(", ")}</>}
      </p>
      {domain.description && <p className="text-[11px] text-[#94A3B8]">{domain.description}</p>}
      {domain.circular_features && domain.circular_features.length > 0 && (
        <p className="text-[11px] text-red-700 italic">
          Circular features: {domain.circular_features.join(", ")} — {domain.circular_reason}
        </p>
      )}
      {domain.note && <p className="text-[11px] text-amber-700 italic">{domain.note}</p>}
    </div>
  );
}

export default function BssiAnalysisPage() {
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [participantCode, setParticipantCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("mst_profiles")
        .select("display_name, participant_code, role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (prof && prof.role !== "researcher" && prof.role !== "admin") {
        router.push("/student/dashboard");
        return;
      }

      setDisplayName(prof?.display_name ?? null);
      setEmail(user?.email ?? null);
      setParticipantCode(prof?.participant_code ?? null);

      try {
        const res = await fetch("/api/researcher/bssi-analysis", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: "Request failed" }));
          setFetchError((j as { error?: string }).error ?? "Failed to load BSSI analysis status.");
        } else {
          setData(await res.json() as Payload);
        }
      } catch {
        setFetchError("Failed to load BSSI analysis status.");
      }
      setLoading(false);
    }
    void init();
  }, [router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#0F172A] text-sm">CodeKidVai Researcher</p>
          <p className="text-xs text-[#64748B]">Research data access portal</p>
        </div>
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-[#FED7AA] flex items-center justify-center hover:bg-[#F37021] hover:text-white transition-colors text-[#F37021] border border-[#FED7AA]"
            title="Profile"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-10 w-64 bg-white border border-[#FED7AA] rounded-2xl shadow-lg z-50 p-4 space-y-3">
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Name</p>
                <p className="text-sm font-semibold text-[#0F172A]">{displayName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Email</p>
                <p className="text-sm text-[#0F172A] break-all">{email ?? "—"}</p>
              </div>
              <hr className="border-[#FED7AA]" />
              <div>
                <p className="text-xs text-[#94A3B8] uppercase tracking-wide mb-0.5">Participant Code</p>
                <p className="text-sm font-mono font-semibold text-[#64748B]">{participantCode ?? "—"}</p>
              </div>
              <hr className="border-[#FED7AA]" />
              <button
                onClick={handleLogout}
                className="w-full py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <ResearcherBreadcrumb current="BSSI Analysis" />

        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">BSSI Analysis</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Behavioral–Sequential–Semantic Integration (BSSI) status — availability only, no invented score.
          </p>
        </div>

        {data && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 space-y-1">
            <p>{data.data_warning}</p>
            <p>{data.framework_note}</p>
          </div>
        )}

        {fetchError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center">
            <p className="text-sm text-red-700 font-semibold">{fetchError}</p>
          </div>
        )}

        {data && (
          <>
            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-2">
              <p className="text-sm font-bold text-[#0F172A]">Conceptual Flow</p>
              <p className="text-xs text-[#64748B] font-mono">{data.conceptual_flow}</p>
              <p className="text-[11px] text-amber-700 italic">{data.conceptual_flow_note}</p>
            </section>

            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3">
              <p className="text-sm font-bold text-[#0F172A]">BSSI Domain Availability</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DOMAIN_ORDER.map((key) => <DomainCard key={key} domain={data.domains[key]} />)}
              </div>
            </section>

            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[#0F172A]">{data.combined.label}</p>
                <StatusPill status={data.combined.status} />
              </div>
              <p className="text-xs text-[#64748B]">{data.combined.description}</p>
              <p className="text-[11px] text-amber-700 italic">{data.combined.note}</p>
            </section>

            <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 space-y-3 overflow-x-auto">
              <p className="text-sm font-bold text-[#0F172A]">Model × Domain Usage Matrix</p>
              <p className="text-[11px] text-[#94A3B8]">
                Derived from the model_usage fields above. A blank cell means that model does not consume that domain
                (or has not been trained yet). "BSSM" is the not-yet-trained integrated model over BSSI Features.
              </p>
              <table className="w-full text-[11px]">
                <thead className="bg-[#FFF7ED] text-[#94A3B8] uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Model</th>
                    {DOMAIN_ORDER.map((key) => (
                      <th key={key} className="text-center px-3 py-2 font-semibold">{DOMAIN_COLUMN_LABEL[key]}</th>
                    ))}
                    <th className="text-center px-3 py-2 font-semibold">Trained</th>
                  </tr>
                </thead>
                <tbody>
                  {data.model_domain_matrix.map((row) => (
                    <tr key={row.model} className="border-b border-[#F1F5F9]">
                      <td className="px-3 py-2 font-semibold text-[#0F172A]">{row.model}</td>
                      {DOMAIN_ORDER.map((key) => (
                        <td key={key} className="px-3 py-2 text-center">
                          {row.uses_domain[key] ? <span className="text-green-600">✓</span> : <span className="text-[#CBD5E1]">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">
                        {row.trained ? <span className="text-green-600">✓</span> : <span className="text-[10px] text-[#94A3B8] italic">not yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
