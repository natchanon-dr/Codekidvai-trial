"use client";
import { useEffect, useState } from "react";
import { getAdminDashboardData, type AdminDashboardData } from "@/services/admin-dashboard-service";

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  useEffect(() => { getAdminDashboardData().then(setData); }, []);
  return <main style={{ maxWidth: 1100, margin: "40px auto", padding: 24 }}>
    <h1>Admin Dashboard</h1>
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </main>;
}
