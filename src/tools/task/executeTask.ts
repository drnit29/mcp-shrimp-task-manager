import { z } from "zod";
import { UUID_V4_REGEX } from "../../utils/regex.js";
import {
  getTaskById,
  updateTaskStatus,
  canExecuteTask,
  assessTaskComplexity,
} from "../../models/taskModel.js";
import { TaskStatus, Task } from "../../types/index.js";
import { getExecuteTaskPrompt } from "../../prompts/index.js";
import { loadTaskRelatedFiles } from "../../utils/fileLoader.js";

// Execute Task Tool
export const executeTaskSchema = z.object({
  taskId: z
    .string()
    .regex(UUID_V4_REGEX, {
      message: "Invalid task ID format, please provide a valid UUID v4 format",
    })
    .describe("Unique identifier of the task to be executed, must be a valid task ID existing in the system"),
});

export async function executeTask({
  taskId,
}: z.infer<typeof executeTaskSchema>) {
  try {
    // 檢查任務是否存在
    const task = await getTaskById(taskId);
    if (!task) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task with ID \`${taskId}\` not found. Please confirm the ID is correct.`,
          },
        ],
      };
    }

    // 檢查任務是否可以執行（依賴任務都已完成）
    const executionCheck = await canExecuteTask(taskId);
    if (!executionCheck.canExecute) {
      const blockedByTasksText =
        executionCheck.blockedBy && executionCheck.blockedBy.length > 0
          ? `Blocked by the following incomplete dependency tasks: ${executionCheck.blockedBy.join(", ")}`
          : "Unable to determine blocking reason";

      return {
        content: [
          {
            type: "text" as const,
            text: `Task "${task.name}" (ID: \`${taskId}\`) cannot be executed at this time. ${blockedByTasksText}`,
          },
        ],
      };
    }

    // 如果任務已經標記為「進行中」，提示用戶
    if (task.status === TaskStatus.IN_PROGRESS) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task "${task.name}" (ID: \`${taskId}\`) is already in progress.`,
          },
        ],
      };
    }

    // 如果任務已經標記為「已完成」，提示用戶
    if (task.status === TaskStatus.COMPLETED) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task "${task.name}" (ID: \`${taskId}\`) is already marked as completed. To re-execute, please delete the task using delete_task and recreate it.`,
          },
        ],
      };
    }

    // 更新任務狀態為「進行中」
    await updateTaskStatus(taskId, TaskStatus.IN_PROGRESS);

    // 評估任務複雜度
    const complexityResult = await assessTaskComplexity(taskId);

    // 將複雜度結果轉換為適當的格式
    const complexityAssessment = complexityResult
      ? {
          level: complexityResult.level,
          metrics: {
            descriptionLength: complexityResult.metrics.descriptionLength,
            dependenciesCount: complexityResult.metrics.dependenciesCount,
          },
          recommendations: complexityResult.recommendations,
        }
      : undefined;

    // 獲取依賴任務，用於顯示完成摘要
    const dependencyTasks: Task[] = [];
    if (task.dependencies && task.dependencies.length > 0) {
      for (const dep of task.dependencies) {
        const depTask = await getTaskById(dep.taskId);
        if (depTask) {
          dependencyTasks.push(depTask);
        }
      }
    }

    // Load task-related file content
    let relatedFilesSummary = "";
    if (task.relatedFiles && task.relatedFiles.length > 0) {
      try {
        const relatedFilesResult = await loadTaskRelatedFiles(
          task.relatedFiles
        );
        relatedFilesSummary =
          typeof relatedFilesResult === "string"
            ? relatedFilesResult
            : relatedFilesResult.summary || "";
      } catch (error) {
        relatedFilesSummary =
          "Error loading related files, please check the files manually.";
      }
    }

    // 使用prompt生成器獲取最終prompt
    const prompt = getExecuteTaskPrompt({
      task,
      complexityAssessment,
      relatedFilesSummary,
      dependencyTasks,
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
    return {
      content: [
        {
          type: "text" as const,
          text: `Error executing task: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}
