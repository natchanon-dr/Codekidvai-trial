import { supabase } from "@/lib/supabase-client";

export interface AssignedStudentTask {
  assignment_id: string;
  batch_id: string;
  batch_code: string;
  batch_name: string;
  task_id: string;
  task_code: string;
  task_title: string;
  task_description: string;
  task_type: string;
  difficulty_level: string;
  expected_concept: string | null;
  max_score: number;
  time_limit_seconds: number | null;
  learning_objective: string | null;
  problem_statement: string | null;
  database_schema_json: Record<string, unknown> | null;
  sample_data_json: Record<string, unknown> | null;
  estimated_time_seconds: number | null;
  assigned_order: number;
  assigned_group: string | null;
  is_required: boolean;
  is_unlocked: boolean;
  assignment_status: string;
}

export async function getAssignedTasksForStudent(): Promise<AssignedStudentTask[]> {
  const { data, error } = await supabase.rpc("get_assigned_tasks_for_student");
  if (error) throw error;
  return data as AssignedStudentTask[];
}

export async function getAssignedTaskForStudent(taskId: string): Promise<AssignedStudentTask | null> {
  const tasks = await getAssignedTasksForStudent();
  return tasks.find((task) => task.task_id === taskId) ?? null;
}
