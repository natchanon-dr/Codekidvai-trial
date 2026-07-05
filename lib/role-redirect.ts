import type { UserRole } from "@/types/dataset";

export function getDashboardPathForRole(role: UserRole | null | undefined) {
  if (role === "teacher" || role === "admin") {
    return "/teacher/dashboard";
  }

  return "/student/dashboard";
}
