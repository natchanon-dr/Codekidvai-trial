import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrResearcher } from "@/lib/api-auth";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// GET /api/researcher/semantic-analysis
// Reads NB10/NB11/NB12 manifests from data/features/ and returns combined
// semantic analysis metadata for the researcher dashboard.
//
// Payload shape:
//   status            — "ready" | "partial" | "unavailable"
//   notebooks_ready   — which of NB10/NB11/NB12 have artifacts
//   complexity        — NB10 dataset_stats + parameters
//   clustering        — NB11 dataset_stats + parameters
//   embeddings        — NB12 dataset_stats + parameters
//   generated_at      — ISO timestamp (most recent manifest)
//   label_validity_note
// ---------------------------------------------------------------------------

const NOTEBOOKS_DIR = path.join(process.cwd(), "notebooks");
const FEAT_DIR      = path.join(NOTEBOOKS_DIR, "data", "features");

type ManifestStatus = "ready" | "unavailable";

interface NotebookManifest {
  schema_version?: string;
  created_at_utc?: string;
  parameters?: Record<string, unknown>;
  dataset_stats?: Record<string, unknown>;
  data_warning?: string;
}

function readManifest(filename: string): { status: ManifestStatus; data: NotebookManifest } {
  const filePath = path.join(FEAT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return { status: "unavailable", data: {} };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return { status: "ready", data: JSON.parse(raw) as NotebookManifest };
  } catch {
    return { status: "unavailable", data: {} };
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrResearcher(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const complexity  = readManifest("complexity_manifest_v1.json");
  const clustering  = readManifest("cluster_manifest_v1.json");
  const embeddings  = readManifest("embeddings_manifest_v1.json");

  const notebooksReady = {
    nb10: complexity.status === "ready",
    nb11: clustering.status === "ready",
    nb12: embeddings.status === "ready",
  };

  const readyCount = Object.values(notebooksReady).filter(Boolean).length;
  const overallStatus =
    readyCount === 3 ? "ready" :
    readyCount > 0   ? "partial" :
    "unavailable";

  // Most recent generated_at across available manifests
  const timestamps = [
    complexity.data.created_at_utc,
    clustering.data.created_at_utc,
    embeddings.data.created_at_utc,
  ].filter((t): t is string => typeof t === "string");

  const generatedAt = timestamps.length > 0
    ? timestamps.sort().at(-1)
    : null;

  return NextResponse.json({
    status:          overallStatus,
    notebooks_ready: notebooksReady,

    complexity: notebooksReady.nb10
      ? {
          schema_version: complexity.data.schema_version,
          parameters:     complexity.data.parameters,
          dataset_stats:  complexity.data.dataset_stats,
          created_at_utc: complexity.data.created_at_utc,
        }
      : null,

    clustering: notebooksReady.nb11
      ? {
          schema_version: clustering.data.schema_version,
          parameters:     clustering.data.parameters,
          dataset_stats:  clustering.data.dataset_stats,
          created_at_utc: clustering.data.created_at_utc,
        }
      : null,

    embeddings: notebooksReady.nb12
      ? {
          schema_version: embeddings.data.schema_version,
          parameters:     embeddings.data.parameters,
          dataset_stats:  embeddings.data.dataset_stats,
          created_at_utc: embeddings.data.created_at_utc,
        }
      : null,

    generated_at: generatedAt,
    label_validity_note:
      "PILOT ONLY — behavioral proxy features. " +
      "No SQL text available in mock dataset. " +
      "label_validity=pilot_only, proxy_target_circularity=true.",
  });
}
