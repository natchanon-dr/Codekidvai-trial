"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type LabItem = {
  assignment_id: string;
  task_code: string | null;
  title: string | null;
  description: string | null;
  max_score: number | null;
  status: string | null;
  is_active: boolean | null;
  owner: { display_name: string | null; participant_code: string | null } | null;
};

type LabSetItem = {
  batch_code: string | null;
};

type TeacherProfile = {
  participant_code: string | null;
};

const labSetTypes = [
  { value: "sql_text", label: "SQL Text", setPrefix: "SLQT", taskPrefixes: ["LQT"], icon: "text" },
  { value: "sql_block", label: "SQL Block", setPrefix: "SLQB", taskPrefixes: ["LQB"], icon: "block" },
  { value: "er_diagram", label: "ER Diagram", setPrefix: "SLER", taskPrefixes: ["LER"], icon: "diagram" },
  { value: "stored_procedure", label: "Stored Procedure", setPrefix: "SLSP", taskPrefixes: ["LSP"], icon: "procedure" },
];

export default function NewLabSetPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [labs, setLabs] = useState<LabItem[]>([]);
  const [labSets, setLabSets] = useState<LabSetItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [setType, setSetType] = useState("sql_text");
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [teacherOwnerKey, setTeacherOwnerKey] = useState<string | null>(null);
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadLabs() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const [response, setsResponse, dashboardResponse] = await Promise.all([
        fetch("/api/teacher/assignments?scope=all&family=lab", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/teacher/assignmentsets?scope=all&family=lab", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/teacher/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        setErrorMessage(json.error ?? text ?? "Failed to load labs.");
        return;
      }

      const loadedLabs = (json.assignments ?? []).filter(isActiveLab);
      setLabs(loadedLabs);

      const dashboardText = await dashboardResponse.text();
      const dashboardJson = dashboardText ? safeJsonParse(dashboardText) : {};
      const teacherKey = dashboardResponse.ok ? dashboardJson.profile?.participant_code ?? null : null;
      if (teacherKey) {
        const hasTeacherLabs = loadedLabs.some((lab) => {
          const ownerKey = lab.owner?.participant_code ?? lab.owner?.display_name ?? "Unknown";
          return ownerKey === teacherKey;
        });
        setTeacherOwnerKey(hasTeacherLabs ? teacherKey : null);
        setOwnerFilter(hasTeacherLabs ? teacherKey : "all");
      }

      const setsText = await setsResponse.text();
      const setsJson = setsText ? safeJsonParse(setsText) : {};
      if (setsResponse.ok) {
        setLabSets(setsJson.assignment_sets ?? []);
      }
    }

    loadLabs();
  }, [router]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const lab of labs) {
      const key = lab.owner?.participant_code ?? lab.owner?.display_name ?? "Unknown";
      const label = lab.owner?.display_name ?? lab.owner?.participant_code ?? "Unknown";
      map.set(key, label);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [labs]);

  const filteredLabs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const taskPrefixes = labSetTypes.find((type) => type.value === setType)?.taskPrefixes ?? ["LQT"];
    return labs.filter((lab) => {
      const ownerKey = lab.owner?.participant_code ?? lab.owner?.display_name ?? "Unknown";
      const haystack = `${lab.task_code ?? ""} ${lab.title ?? ""}`.toLowerCase();
      const matchesType = taskPrefixes.some((prefix) => lab.task_code?.startsWith(prefix));
      return matchesType && (ownerFilter === "all" || ownerFilter === ownerKey) && (!normalized || haystack.includes(normalized));
    });
  }, [labs, query, ownerFilter, setType]);

  const nextLabSetCode = useMemo(() => {
    const setPrefix = labSetTypes.find((type) => type.value === setType)?.setPrefix ?? "SLQT";
    const pattern = new RegExp(`^${setPrefix}(\\d+)$`);
    const numbers = labSets
      .map((set) => set.batch_code?.match(pattern)?.[1])
      .filter(Boolean)
      .map((value) => Number(value));
    const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const maxWidth = Math.max(4, ...labSets.map((set) => set.batch_code?.match(pattern)?.[1]?.length ?? 0));
    return `${setPrefix}${String(nextNumber).padStart(maxWidth, "0")}`;
  }, [labSets, setType]);

  function changeSetType(nextType: string) {
    setSetType(nextType);
    setSelectedIds(new Set());
  }

  function toggleSelected(labId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(labId)) next.delete(labId);
      else next.add(labId);
      return next;
    });
  }

  async function createLabSet() {
    const name = setName.trim();
    if (!name || saving) return;

    setSaving(true);
    setErrorMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const response = await fetch("/api/teacher/assignmentsets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        family: "lab",
        batch_code: nextLabSetCode,
        batch_name: name,
        batch_description: setDescription,
        status: "active",
        set_type: setType,
        selected_task_ids: [...selectedIds],
      }),
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : {};
    if (!response.ok) {
      setErrorMessage(json.error ?? text ?? "Failed to create lab set.");
      setSaving(false);
      return;
    }

    router.push("/teacher/labs");
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/labs" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Lab Sets
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">New Lab Set</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">New Lab Set</h1>
            <p className="text-sm text-[#64748B] mt-1">Select active labs before creating a new lab set.</p>
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
              href="/api/teacher/assignmentsets/template"
              className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold"
            >
              Template
            </Link>
            {uploadFileName && <span className="basis-full sm:basis-auto text-xs text-[#64748B]">{uploadFileName}</span>}
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {labSetTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => changeSetType(type.value)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  setType === type.value
                    ? "border-[#F37021] bg-[#F37021] text-white"
                    : "border-[#FED7AA] bg-[#FFF7ED] text-[#0F172A] hover:border-[#F37021]"
                }`}
              >
                <span>{type.label}</span>
                <TypeIcon name={type.icon} />
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by lab code or name"
            className="lg:col-span-2 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          >
            <option value="all">All teachers</option>
            {teacherOwnerKey && <option value={teacherOwnerKey}>My labs</option>}
            {owners.map((owner) => (
              owner.value === teacherOwnerKey ? null : <option key={owner.value} value={owner.value}>{owner.label}</option>
            ))}
          </select>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input
              value={nextLabSetCode}
              readOnly
              aria-label="Lab set code"
              className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#F8FAFC] text-sm font-mono font-bold text-[#F37021] cursor-not-allowed"
            />
            <input
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              placeholder="Lab Set Name"
              className="px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm"
            />
          </div>
          <textarea
            value={setDescription}
            onChange={(event) => setSetDescription(event.target.value)}
            placeholder="Lab Set Description"
            rows={3}
            className="w-full mb-5 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm resize-none"
          />
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#0F172A]">
              Selected Labs: <span className="text-[#F37021]">{selectedIds.size}</span>
            </p>
          </div>
          <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
            {filteredLabs.length === 0 ? (
              <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-8 text-center text-sm text-[#64748B]">
                No active labs match the current filters.
              </div>
            ) : (
              filteredLabs.map((lab) => (
                <div key={lab.assignment_id} className="flex items-start gap-3 border border-[#FED7AA] rounded-xl px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lab.assignment_id)}
                    onChange={() => toggleSelected(lab.assignment_id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-bold text-[#F37021]">{lab.task_code ?? "-"}</p>
                    <p className="text-sm font-semibold text-[#0F172A]">{lab.title ?? "Untitled lab"}</p>
                    <p className="text-xs text-[#64748B]">Owner: {lab.owner?.display_name ?? lab.owner?.participant_code ?? "Unknown"}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={createLabSet}
            disabled={!setName.trim() || saving}
            className="mt-5 px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#F37021]/50"
          >
            {saving ? "Creating..." : `Create Lab Set (${selectedIds.size})`}
          </button>
        </section>
      </main>
    </div>
  );
}

function isActiveLab(lab: LabItem) {
  return Boolean(lab.is_active) && lab.status !== "archived";
}

function TypeIcon({ name }: { name: string }) {
  if (name === "block") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 3h3v3a2 2 0 1 0 4 0V3h3A2.5 2.5 0 0 1 21 5.5v3h-3a2 2 0 1 0 0 4h3v3A2.5 2.5 0 0 1 18.5 18h-3v-3a2 2 0 1 0-4 0v3h-3A2.5 2.5 0 0 1 6 15.5v-3H3a2 2 0 1 1 0-4h3v-3A2.5 2.5 0 0 1 8.5 3Z" />
      </svg>
    );
  }
  if (name === "diagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="5" rx="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.5" />
        <path d="M10 6.5h4.5a3 3 0 0 1 3 3V15" />
        <path d="M6.5 9v5a3 3 0 0 0 3 3H14" />
      </svg>
    );
  }
  if (name === "procedure") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        <path d="M10 10h4" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
      <path d="M7 20h10" />
    </svg>
  );
}

function safeJsonParse(text: string): {
  error?: string;
  assignments?: LabItem[];
  assignment_sets?: LabSetItem[];
  profile?: TeacherProfile;
} {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
