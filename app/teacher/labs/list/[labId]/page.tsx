"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type LabDetail = {
  task_id: string;
  task_code: string | null;
  task_title: string | null;
  task_description: string | null;
  task_type: string | null;
  problem_statement: string | null;
  expected_answer: string | null;
};

type DetailPayload = {
  assignment: LabDetail;
};

const labTypes = [
  { value: "sql_text", label: "SQL Text" },
  { value: "sql_block", label: "SQL Block" },
  { value: "er_diagram", label: "ER Diagram" },
  { value: "stored_procedure", label: "Stored Procedure" },
];

export default function EditLabPage() {
  const params = useParams<{ labId: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [labCode, setLabCode] = useState("");
  const [labType, setLabType] = useState("sql_text");
  const [labName, setLabName] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLab() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch(`/api/teacher/assignments/${params.labId}?family=lab`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = (text ? safeJsonParse(text) : {}) as Partial<DetailPayload> & { error?: string };
      if (!response.ok || !json.assignment) {
        setErrorMessage(json.error ?? text ?? "Failed to load lab.");
        setLoading(false);
        return;
      }

      setLabCode(json.assignment.task_code ?? "");
      setLabType(json.assignment.task_type ?? "sql_text");
      setLabName(json.assignment.task_title ?? "");
      setProblemStatement(json.assignment.problem_statement ?? json.assignment.task_description ?? "");
      setExpectedAnswer(json.assignment.expected_answer ?? "");
      setLoading(false);
    }

    loadLab();
  }, [params.labId, router]);

  async function saveLab() {
    if (!labName.trim() || saving) return;
    setSaving(true);
    setErrorMessage(null);
    setSaveMessage(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch(`/api/teacher/assignments/${params.labId}?family=lab`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        task_title: labName,
        task_description: problemStatement,
        problem_statement: problemStatement,
        expected_answer: expectedAnswer,
        max_score: 0,
      }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to save lab.");
      setSaving(false);
      return;
    }

    setSaveMessage("Lab saved.");
    setSaving(false);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading lab...</div>;
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/teacher/labs/list" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Lab List
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Edit Lab</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Edit Lab</h1>
            <p className="text-sm text-[#64748B] mt-1">Edit lab details for Lab Sets.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => setUploadFileName(event.target.files?.[0]?.name ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl border border-[#F37021] text-[#F37021] bg-white hover:bg-[#FFF7ED] text-sm font-semibold"
            >
              Upload
            </button>
            <Link
              href="/api/teacher/assignments/template"
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold"
            >
              Template
            </Link>
            {uploadFileName && <span className="basis-full sm:basis-auto text-xs text-[#64748B]">{uploadFileName}</span>}
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-[#0F172A]">Manual Edit</h2>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {labTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  disabled
                  aria-pressed={labType === type.value}
                  className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                    labType === type.value
                      ? "border-[#F37021] bg-[#F37021] text-white"
                      : "border-[#FED7AA] bg-[#FFF7ED] text-[#94A3B8]"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
            <input
              value={labCode}
              readOnly
              aria-label="Lab code"
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm font-mono font-bold text-[#F37021] cursor-not-allowed"
            />
            <input
              value={labName}
              onChange={(event) => setLabName(event.target.value)}
              placeholder="Lab name"
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
            <textarea
              value={problemStatement}
              onChange={(event) => setProblemStatement(event.target.value)}
              placeholder="Lab instruction"
              rows={5}
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
            <textarea
              value={expectedAnswer}
              onChange={(event) => setExpectedAnswer(event.target.value)}
              placeholder="Expected result or answer"
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={saveLab}
              disabled={!labName.trim() || saving}
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
            >
              {saving ? "Saving..." : "Save Lab"}
            </button>
            {saveMessage && <span className="text-sm font-semibold text-green-700">{saveMessage}</span>}
          </div>
        </section>
      </main>
    </div>
  );
}

function safeJsonParse(text: string): ({ error?: string } & Partial<DetailPayload>) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
