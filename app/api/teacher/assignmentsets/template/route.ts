import { NextResponse } from "next/server";
import { convertRowsToCsv } from "@/lib/csv-utils";

export async function GET() {
  const csv = convertRowsToCsv([
    {
      assignment_set_code: "SAQT0001",
      assignment_set_name: "Example Assignment Set",
      assignment_set_description: "Short assignment set description",
      assignment_code: "AQT000001",
      score: 10,
      assigned_order: 1,
    },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="assignment_set_excel_template.csv"',
    },
  });
}
