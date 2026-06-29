import { supabase } from "@/lib/supabase-client";
import type { StudentBlock } from "@/types/dataset";

export async function getBlocksForStudentTask(taskId: string): Promise<StudentBlock[]> {
  const { data, error } = await supabase.rpc("get_blocks_for_student_task", { p_task_id: taskId });
  if (error) throw error;
  return data as StudentBlock[];
}
