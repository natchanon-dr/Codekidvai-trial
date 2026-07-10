import { redirect } from "next/navigation";

// Legacy route — dataset export has moved to the researcher portal.
export default function AdminDatasetRedirect() {
  redirect("/researcher/dataset");
}
