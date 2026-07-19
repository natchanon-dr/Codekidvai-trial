"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type StatusFilter = "active" | "inactive" | "all";
type TypeFilter = "all" | "qt" | "qb" | "er" | "sp";

type LabSet = {
  batch_id: string;
  batch_code: string | null;
  batch_name: string | null;
  batch_description: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  task_count: number;
  assigned_classes_count: number;
  assigned_classes?: AssignedClass[];
  owner: { display_name: string | null; participant_code: string | null } | null;
};

type AssignedClass = {
  class_id: string;
  class_code: string;
  class_name: string;
};

export default function TeacherLabsPage() {
  const router = useRouter();
  const [sets, setSets] = useState<LabSet[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [classModalSet, setClassModalSet] = useState<LabSet | null>(null);

  useEffect(() => {
    async function loadSets() {
      const token = await getToken();
      if (!token) {
        router.push("/auth/login");
        return;
      }

      const response = await fetch("/api/teacher/assignmentsets?family=lab", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const json = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        if (String(json.error ?? "").includes("Teacher or admin")) router.push("/student/dashboard");
        else setErrorMessage(json.error ?? text ?? "Failed to load lab sets.");
        setLoading(false);
        return;
      }

      setSets(json.assignment_sets ?? []);
      setLoading(false);
    }

    loadSets();
  }, [router]);

  const filteredSets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sets.filter((set) => {
      const active = set.status === "active";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && active) ||
        (statusFilter === "inactive" && !active);
      const haystack = `${set.batch_code ?? ""} ${set.batch_name ?? ""}`.toLowerCase();
      return matchesStatus && matchesLabSetType(set.batch_code, typeFilter) && (!normalized || haystack.includes(normalized));
    });
  }, [sets, query, statusFilter, typeFilter]);

  async function toggleSetStatus(setId: string, nextActive: boolean) {
    setUpdatingId(setId);
    const token = await getToken();
    if (!token) return;

    const response = await fetch(`/api/teacher/assignmentsets/${setId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextActive ? "active" : "inactive" }),
    });
    if (response.ok) {
      setSets((current) => current.map((set) => set.batch_id === setId
        ? { ...set, status: nextActive ? "active" : "archived", updated_at: new Date().toISOString() }
        : set));
    } else {
      const text = await response.text();
      alert(safeJsonParse(text).error ?? "Failed to update lab set.");
    }
    setUpdatingId(null);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-[#64748B]">Loading lab sets...</div>;
  }

  if (errorMessage) {
    return <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center text-sm text-red-600">{errorMessage}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED]">
      <header className="bg-white border-b border-[#FED7AA] px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/teacher/dashboard" className="text-sm font-semibold text-[#64748B] hover:text-[#F37021]">
            Teacher Dashboard
          </Link>
          <span className="text-xs font-semibold text-[#F37021]">Lab Sets by teacher</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Lab Sets</h1>
            <p className="text-sm text-[#64748B] mt-1">Practice lab records created by this teacher.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/teacher/labs/new" className="px-4 py-2 rounded-xl bg-[#F37021] hover:bg-[#C2410C] text-white text-sm font-semibold">
              New Lab Set
            </Link>
            <Link href="/teacher/labs/create" className="px-4 py-2 rounded-xl border border-[#F37021] text-[#F37021] bg-white hover:bg-[#FFF7ED] text-sm font-semibold">
              New Lab
            </Link>
            <Link href="/teacher/labs/list" className="px-4 py-2 rounded-xl border border-[#FED7AA] text-[#0F172A] bg-white hover:border-[#F37021] text-sm font-semibold">
              Lab List
            </Link>
          </div>
        </section>

        <section className="bg-white border border-[#FED7AA] rounded-2xl p-4 flex flex-col lg:flex-row gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by lab set code or name"
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F37021]"
          />
          <TypeFilterButtons value={typeFilter} onChange={setTypeFilter} />
          <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
            {(["active", "inactive", "all"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                aria-label={`Filter ${getStatusFilterLabel(status)}`}
                title={getStatusFilterLabel(status)}
                className={`inline-flex h-10 w-12 items-center justify-center text-sm font-semibold uppercase ${statusFilter === status ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
              >
                {status === "all" ? "ALL" : <StatusFilterIcon status={status} />}
              </button>
            ))}
          </div>
        </section>

        {filteredSets.length === 0 ? (
          <div className="bg-white border border-[#FED7AA] rounded-2xl p-8 text-center text-sm text-[#64748B]">
            No lab sets match the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredSets.map((set) => (
              <article key={set.batch_id} className="bg-white border border-[#FED7AA] rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {set.batch_code && <span className="font-mono text-xs font-bold text-[#F37021]">{set.batch_code}</span>}
                      <Badge>{set.status ?? "draft"}</Badge>
                    </div>
                    <h2 className="text-base font-bold text-[#0F172A]">{set.batch_name ?? "Untitled lab set"}</h2>
                    <p className="text-sm text-[#64748B] mt-1">{set.batch_description ?? "No description provided."}</p>
                    <div className="flex flex-wrap gap-4 mt-4 text-xs text-[#64748B]">
                      <span>{set.task_count} labs</span>
                      <button
                        type="button"
                        onClick={() => setClassModalSet(set)}
                        className="font-semibold text-[#F37021] underline-offset-2 hover:underline"
                      >
                        {set.assigned_classes_count} classes
                      </button>
                      {set.created_at && <span>Created {new Date(set.created_at).toLocaleDateString()}</span>}
                      {set.updated_at && <span>Updated {new Date(set.updated_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-start lg:items-end gap-3">
                    <p className="text-xs text-[#64748B] text-left lg:text-right">
                      Owner: <span className="font-semibold text-[#0F172A]">{set.owner?.display_name ?? set.owner?.participant_code ?? "Unknown"}</span>
                    </p>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/teacher/labs/${set.batch_id}`}
                        aria-label="Edit lab set"
                        title="Edit"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F37021] text-white hover:bg-[#C2410C]"
                      >
                        <PencilIcon />
                      </Link>
                      <SetActiveSwitch
                        active={set.status === "active"}
                        disabled={updatingId === set.batch_id}
                        onToggle={(nextActive) => toggleSetStatus(set.batch_id, nextActive)}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      {classModalSet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="w-full max-w-xl rounded-2xl border border-[#FED7AA] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A]">Linked Classes</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  <span className="font-mono font-semibold text-[#F37021]">{classModalSet.batch_code ?? "-"}</span>
                  <span className="mx-2 text-[#CBD5E1]">|</span>
                  {classModalSet.batch_name ?? "Untitled lab set"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClassModalSet(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#FED7AA] bg-white text-lg font-bold text-[#F37021] hover:bg-[#FFF7ED]"
              >
                x
              </button>
            </div>
            {(classModalSet.assigned_classes ?? []).length === 0 ? (
              <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-5 text-center text-sm text-[#64748B]">
                No classes linked to this lab set.
              </div>
            ) : (
              <div className="space-y-2">
                {(classModalSet.assigned_classes ?? []).map((classItem) => (
                  <div key={classItem.class_id} className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3">
                    <p className="text-sm font-semibold text-[#0F172A]">{classItem.class_name}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-[#F37021]">{classItem.class_code}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-[#FFF7ED] text-[#92400E] border-[#FED7AA] capitalize">
      {children}
    </span>
  );
}

function getStatusFilterLabel(status: StatusFilter) {
  const labels: Record<StatusFilter, string> = {
    active: "Active",
    inactive: "Inactive",
    all: "All",
  };
  return labels[status];
}

function StatusFilterIcon({ status }: { status: Exclude<StatusFilter, "all"> }) {
  if (status === "inactive") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M8 12h8" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.4 2.4 4.8-5" />
    </svg>
  );
}

function SetActiveSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  onToggle: (active: boolean) => void;
}) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-pressed={active}
        aria-label="Toggle lab set active status"
        disabled={disabled}
        onClick={() => onToggle(!active)}
        title={active ? "Active" : "Inactive"}
        className={`relative h-8 w-14 rounded-full transition-colors disabled:opacity-40 ${active ? "bg-green-500" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${active ? "left-1 translate-x-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}

function TypeFilterButtons({
  value,
  onChange,
}: {
  value: TypeFilter;
  onChange: (value: TypeFilter) => void;
}) {
  return (
    <div className="flex rounded-xl border border-[#FED7AA] overflow-hidden bg-white">
      {(["qt", "qb", "er", "sp", "all"] as TypeFilter[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          aria-label={`Filter ${getTypeFilterLabel(type)}`}
          title={getTypeFilterLabel(type)}
          className={`inline-flex h-10 w-12 items-center justify-center text-sm font-semibold uppercase ${value === type ? "bg-[#F37021] text-white" : "text-[#64748B] hover:bg-[#FFF7ED]"}`}
        >
          {type === "all" ? "ALL" : <TypeFilterIcon type={type} />}
        </button>
      ))}
    </div>
  );
}

function getTypeFilterLabel(type: TypeFilter) {
  const labels: Record<TypeFilter, string> = {
    qt: "SQL Text",
    qb: "SQL Block",
    er: "ER Diagram",
    sp: "Stored Procedure",
    all: "All",
  };
  return labels[type];
}

function TypeFilterIcon({ type }: { type: Exclude<TypeFilter, "all"> }) {
  const iconClass = "h-4 w-4";
  if (type === "qb") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 3h3v3a2 2 0 1 0 4 0V3h3A2.5 2.5 0 0 1 21 5.5v3h-3a2 2 0 1 0 0 4h3v3A2.5 2.5 0 0 1 18.5 18h-3v-3a2 2 0 1 0-4 0v3h-3A2.5 2.5 0 0 1 6 15.5v-3H3a2 2 0 1 1 0-4h3v-3A2.5 2.5 0 0 1 8.5 3Z" />
      </svg>
    );
  }
  if (type === "er") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="5" rx="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.5" />
        <path d="M10 6.5h4.5a3 3 0 0 1 3 3V15" />
        <path d="M6.5 9v5a3 3 0 0 0 3 3H14" />
      </svg>
    );
  }
  if (type === "sp") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
      <path d="M7 20h10" />
    </svg>
  );
}

function matchesLabSetType(code: string | null, type: TypeFilter) {
  if (type === "all") return true;
  const normalized = String(code ?? "").toUpperCase();
  const prefixes: Record<Exclude<TypeFilter, "all">, string[]> = {
    qt: ["SLQT", "LQT"],
    qb: ["SLQB", "LQB"],
    er: ["SLER", "LER"],
    sp: ["SLSP", "LSP"],
  };
  return prefixes[type].some((prefix) => normalized.startsWith(prefix));
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function safeJsonParse(text: string): { error?: string; assignment_sets?: LabSet[] } {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
