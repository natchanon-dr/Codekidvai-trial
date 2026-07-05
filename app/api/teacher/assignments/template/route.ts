import { NextResponse } from "next/server";
import { convertRowsToCsv } from "@/lib/csv-utils";

export async function GET() {
  const csv = convertRowsToCsv([
    {
      task_code: "QT000001",
      assignment_name: "Example Assignment",
      description: "Short assignment description",
      problem_statement: "Write the problem statement here",
      expected_answer: "Write the expected answer here",
      task_type: "coding",
      difficulty_level: "beginner",
      max_score: 10,
      estimated_time_minutes: 30,
    },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="assignment_excel_template.csv"',
    },
  });
}
