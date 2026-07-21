/**
 * Canonical Task Type icon, label, and ordering used across Researcher pages.
 *
 * Source of truth: mst_tasks.task_type CHECK constraint in
 * database/migrations/001_create_core_schema.sql
 *
 * DO NOT duplicate this mapping in individual pages.
 * Import TaskTypeIcon and TASK_TYPE_LABEL from here.
 */

import React from "react";

// ---------------------------------------------------------------------------
// Icons (SVG) — one per task_type DB code
// ---------------------------------------------------------------------------

export function TaskTypeIcon({
  type,
  className = "w-4 h-4",
}: {
  type: string;
  className?: string;
}) {
  if (type === "sql_block") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M8.5 3h3v3a2 2 0 1 0 4 0V3h3A2.5 2.5 0 0 1 21 5.5v3h-3a2 2 0 1 0 0 4h3v3A2.5 2.5 0 0 1 18.5 18h-3v-3a2 2 0 1 0-4 0v3h-3A2.5 2.5 0 0 1 6 15.5v-3H3a2 2 0 1 1 0-4h3v-3A2.5 2.5 0 0 1 8.5 3Z" />
      </svg>
    );
  }
  if (type === "er_diagram") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="3" y="4" width="7" height="5" rx="1.5" />
        <rect x="14" y="15" width="7" height="5" rx="1.5" />
        <path d="M10 6.5h4.5a3 3 0 0 1 3 3V15" />
        <path d="M6.5 9v5a3 3 0 0 0 3 3H14" />
      </svg>
    );
  }
  if (type === "stored_procedure") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }
  if (type === "coding_text" || type === "coding_block") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M8 6L3 12l5 6" />
        <path d="M16 6l5 6-5 6" />
      </svg>
    );
  }
  // sql_text / default
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 4h10" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
      <path d="M7 20h10" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Labels — full UI display name per task_type DB code
// ---------------------------------------------------------------------------

export const TASK_TYPE_LABEL: Record<string, string> = {
  sql_text: "SQL Text",
  sql_block: "SQL Block",
  er_diagram: "ER Diagram",
  stored_procedure: "Stored Procedure",
  coding_text: "Coding (Text)",
  coding_block: "Coding (Block)",
};

// ---------------------------------------------------------------------------
// Short labels — compact form for tables / chips
// ---------------------------------------------------------------------------

export const TASK_TYPE_SHORT_LABEL: Record<string, string> = {
  sql_text: "SQL Text",
  sql_block: "SQL Block",
  er_diagram: "ER",
  stored_procedure: "Store",
  coding_text: "Code",
  coding_block: "Code (B)",
};

// ---------------------------------------------------------------------------
// Canonical display order
// ---------------------------------------------------------------------------

export const TASK_TYPE_ORDER: readonly string[] = [
  "sql_text",
  "stored_procedure",
  "sql_block",
  "er_diagram",
  "coding_text",
  "coding_block",
];
