import { z } from "zod";
import { searchTasksWithCommand } from "../../models/taskModel.js";
import { getGetTaskDetailPrompt } from "../../prompts/index.js";

// Parameters for getting complete task details
export const getTaskDetailSchema = z.object({
  taskId: z
    .string()
    .min(1, {
      message: "Task ID cannot be empty, please provide a valid task ID",
    })
    .describe("Task ID for viewing details"),
});

// 取得任務完整詳情
export async function getTaskDetail({
  taskId,
}: z.infer<typeof getTaskDetailSchema>) {
  try {
    // 使用 searchTasksWithCommand 替代 getTaskById，實現記憶區任務搜索
    // 設置 isId 為 true，表示按 ID 搜索；頁碼為 1，每頁大小為 1
    const result = await searchTasksWithCommand(taskId, true, 1, 1);

    // 檢查是否找到任務
    if (result.tasks.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `## Error\n\nTask with ID \`${taskId}\` not found. Please confirm the task ID is correct.`,
          },
        ],
        isError: true,
      };
    }

    // 獲取找到的任務（第一個也是唯一的一個）
    const task = result.tasks[0];

    // 使用prompt生成器獲取最終prompt
    const prompt = getGetTaskDetailPrompt({
      taskId,
      task,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    };
  } catch (error) {
    // Use prompt generator to get error message
    const errorPrompt = getGetTaskDetailPrompt({
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: errorPrompt,
        },
      ],
    };
  }
}
