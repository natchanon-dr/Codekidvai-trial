import type { UserRole } from "@/types/dataset";

/** Landing page for each role after login or consent. */
const ROLE_HOME: Record<UserRole, string> = {
  student: "/student/dashboard",
  teacher: "/teacher/dashboard",
  admin: "/teacher/dashboard",
  researcher: "/researcher/dashboard",
};

export function getRoleHomePath(role: UserRole): string {
  return ROLE_HOME[role] ?? ROLE_HOME.student;
}
