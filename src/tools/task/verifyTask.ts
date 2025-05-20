import { z } from "zod";
import { UUID_V4_REGEX } from "../../utils/regex.js";
import {
  getTaskById,
  updateTaskStatus,
  updateTaskSummary,
} from "../../models/taskModel.js";
import { TaskStatus } from "../../types/index.js";
import { getVerifyTaskPrompt } from "../../prompts/index.js";

// Verify Task Tool
export const verifyTaskSchema = z.object({
  taskId: z
    .string()
    .regex(UUID_V4_REGEX, {
      message: "Invalid task ID format, please provide a valid UUID v4 format",
    })
    .describe("Unique identifier of the task to be verified, must be a valid task ID existing in the system"),
  summary: z
    .string()
    .min(30, {
      message: "Minimum 30 characters",
    })
    .describe(
      "When the score is 80 or higher, it represents the task completion summary, concisely describing implementation results and important decisions. When the score is below 80, it represents missing or needing correction parts description, minimum 30 characters"
    ),
  score: z
    .number()
    .min(0, { message: "Score cannot be less than 0" })
    .max(100, { message: "Score cannot be greater than 100" })
    .describe("Score for the task, task is automatically completed when the score is 80 or higher"),
});

export async function verifyTask({
  taskId,
  summary,
  score,
}: z.infer<typeof verifyTaskSchema>) {
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## System Error\n\nTask with ID \`${taskId}\` not found. Please use the \"list_tasks\" tool to confirm a valid task ID and try again.`,
        },
      ],
      isError: true,
    };
  }

  if (task.status !== TaskStatus.IN_PROGRESS) {
    return {
      content: [
        {
          type: "text" as const,
          text: `## Status Error\n\nTask "${task.name}" (ID: \`${task.id}\`) current status is "${task.status}", not in progress, cannot be verified.\n\nOnly tasks with status \"in_progress\" can be verified. Please use the \"execute_task\" tool to start task execution first.`,
        },
      ],
      isError: true,
    };
  }

  if (score >= 80) {
    // 更新任務狀態為已完成，並添加摘要
    await updateTaskSummary(taskId, summary);
    await updateTaskStatus(taskId, TaskStatus.COMPLETED);
  }

  // 使用prompt生成器獲取最終prompt
  const prompt = getVerifyTaskPrompt({ task, score, summary });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}
