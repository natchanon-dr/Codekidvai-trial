"use client";
import { useState } from "react";
import { exportDatasetAsCsv, type DatasetExportType } from "@/services/admin-dataset-export-service";

const types: DatasetExportType[] = ["attempt", "session", "sequence", "raw_event"];

export default function AdminDatasetPage() {
  const [batchCode, setBatchCode] = useState("");
  return <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}>
    <h1>Dataset Export</h1>
    <input placeholder="Batch code optional" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} />
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      {types.map((type) => <button key={type} onClick={() => exportDatasetAsCsv(type, { batch_code: batchCode || undefined })}>Export {type}</button>)}
    </div>
  </main>;
}
