import { z } from "zod";
import {
  getAllTasks,
  batchCreateOrUpdateTasks,
  clearAllTasks as modelClearAllTasks,
} from "../../models/taskModel.js";
import { RelatedFileType, Task } from "../../types/index.js";
import { getSplitTasksPrompt } from "../../prompts/index.js";

// 拆分任務工具
export const splitTasksRawSchema = z.object({
  updateMode: z
    .enum(["append", "overwrite", "selective", "clearAllTasks"])
    .describe(
       "Task update mode selection: 'append' (keep all existing tasks and add new ones), 'overwrite' (clear all incomplete tasks and replace completely, keep completed tasks), 'selective' (smart update: match and update existing tasks by task name, keep tasks not in the list, recommended for task fine-tuning), 'clearAllTasks' (clear all tasks and create a backup).\nDefault is 'clearAllTasks' mode, other modes are only used when the user requests changes or modifications to the plan content"
    ),
  tasksRaw: z
    .string()
    .describe(
      "結構化的任務清單，每個任務應保持原子性且有明確的完成標準，避免過於簡單的任務，簡單修改可與其他任務整合，避免任務過多，範例：[{name: '簡潔明確的任務名稱，應能清晰表達任務目的', description: '詳細的任務描述，包含實施要點、技術細節和驗收標準', implementationGuide: '此特定任務的具體實現方法和步驟，請參考之前的分析結果提供精簡pseudocode', notes: '補充說明、特殊處理要求或實施建議（選填）', dependencies: ['此任務依賴的前置任務完整名稱'], relatedFiles: [{path: '文件路徑', type: '文件類型 (TO_MODIFY: 待修改, REFERENCE: 參考資料, CREATE: 待建立, DEPENDENCY: 依賴文件, OTHER: 其他)', description: '文件描述', lineStart: 1, lineEnd: 100}], verificationCriteria: '此特定任務的驗證標準和檢驗方法'}, {name: '任務2', description: '任務2描述', implementationGuide: '任務2實現方法', notes: '補充說明、特殊處理要求或實施建議（選填）', dependencies: ['任務1'], relatedFiles: [{path: '文件路徑', type: '文件類型 (TO_MODIFY: 待修改, REFERENCE: 參考資料, CREATE: 待建立, DEPENDENCY: 依賴文件, OTHER: 其他)', description: '文件描述', lineStart: 1, lineEnd: 100}], verificationCriteria: '此特定任務的驗證標準和檢驗方法'}]"
    ),
  globalAnalysisResult: z
    .string()
    .optional()
    .describe("任務最終目標，來自之前分析適用於所有任務的通用部分"),
});

const tasksSchema = z
  .array(
    z.object({
      name: z
        .string()
        .max(100, {
          message: "Task name is too long, please limit to within 100 characters",
        })
        .describe("Concise and clear task name, should clearly express the task purpose"),
      description: z
        .string()
        .min(10, {
          message: "Task description is too short, please provide more detailed content to ensure understanding",
        })
        .describe("Detailed task description, including implementation points, technical details, and acceptance criteria"),
      implementationGuide: z
        .string()
        .describe(
          "Specific implementation methods and steps for this task, please refer to previous analysis results to provide concise pseudocode"
        ),
      dependencies: z
        .array(z.string())
        .optional()
        .describe(
          "List of prerequisite task IDs or task names this task depends on, supports two reference methods, name reference is more intuitive, is a string array"
        ),
      notes: z
        .string()
        .optional()
        .describe("Supplementary notes, special handling requirements, or implementation suggestions (optional)"),
      relatedFiles: z
        .array(
          z.object({
            path: z
              .string()
              .min(1, {
                message: "File path cannot be empty",
              })
              .describe("File path, can be relative to the project root or absolute path"),
            type: z
              .nativeEnum(RelatedFileType)
              .describe(
                "File type (TO_MODIFY: to be modified, REFERENCE: reference material, CREATE: to be created, DEPENDENCY: dependency file, OTHER: other)"
              ),
            description: z
              .string()
              .min(1, {
                message: "File description cannot be empty",
              })
              .describe("File description, used to explain the purpose and content of the file"),
            lineStart: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Starting line of the relevant code block (optional)"),
            lineEnd: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Ending line of the relevant code block (optional)"),
          })
        )
        .optional()
        .describe(
          "List of files related to the task, used to record code files, reference materials, files to be created, etc. related to the task (optional)"
        ),
      verificationCriteria: z
        .string()
        .optional()
        .describe("Verification criteria and inspection methods for this specific task"),
    })
  )
  .min(1, {
    message: "Please provide at least one task",
  })
  .describe(
    "Structured task list, each task should be atomic and have clear completion criteria, avoid overly simple tasks, simple modifications can be integrated with other tasks, avoid too many tasks"
  );

export async function splitTasksRaw({
  updateMode,
  tasksRaw,
  globalAnalysisResult,
}: z.infer<typeof splitTasksRawSchema>) {
  let tasks: Task[] = [];
  try {
    tasks = JSON.parse(tasksRaw);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "tasksRaw parameter format error, please ensure the format is correct, please try to correct the error, if the text is too long to be successfully repaired, please call in batches, this can avoid problems caused by the message being too long to be easily corrected, error message: " +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    };
  }

  // 使用 tasksSchema 驗證 tasks
  const tasksResult = tasksSchema.safeParse(tasks);
  if (!tasksResult.success) {
    // 返回錯誤訊息
    return {
      content: [
        {
          type: "text" as const,
          text:
            "tasks parameter format error, please ensure the format is correct, error message: " +
            tasksResult.error.message,
        },
      ],
    };
  }

  try {
    // 檢查 tasks 裡面的 name 是否有重複
    const nameSet = new Set();
    for (const task of tasks) {
      if (nameSet.has(task.name)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Duplicate task names exist in the tasks parameter, please ensure each task name is unique",
            },
          ],
        };
      }
      nameSet.add(task.name);
    }

    // 根據不同的更新模式處理任務
    let message = "";
    let actionSuccess = true;
    let backupFile = null;
    let createdTasks: Task[] = [];
    let allTasks: Task[] = [];

    // 將任務資料轉換為符合batchCreateOrUpdateTasks的格式
    const convertedTasks = tasks.map((task) => ({
      name: task.name,
      description: task.description,
      notes: task.notes,
      dependencies: task.dependencies as unknown as string[],
      implementationGuide: task.implementationGuide,
      verificationCriteria: task.verificationCriteria,
      relatedFiles: task.relatedFiles?.map((file) => ({
        path: file.path,
        type: file.type as RelatedFileType,
        description: file.description,
        lineStart: file.lineStart,
        lineEnd: file.lineEnd,
      })),
    }));

    // 處理 clearAllTasks 模式
    if (updateMode === "clearAllTasks") {
      const clearResult = await modelClearAllTasks();

      if (clearResult.success) {
        message = clearResult.message;
        backupFile = clearResult.backupFile;

        try {
          // 清空任務後再創建新任務
          createdTasks = await batchCreateOrUpdateTasks(
            convertedTasks,
            "append",
            globalAnalysisResult
          );
          message += `\n成功創建了 ${createdTasks.length} 個新任務。`;
        } catch (error) {
          actionSuccess = false;
          message += `\nError creating new tasks: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      } else {
        actionSuccess = false;
        message = clearResult.message;
      }
    } else {
      // 對於其他模式，直接使用 batchCreateOrUpdateTasks
      try {
        createdTasks = await batchCreateOrUpdateTasks(
          convertedTasks,
          updateMode,
          globalAnalysisResult
        );

        // 根據不同的更新模式生成消息
        switch (updateMode) {
          case "append":
            message = `成功追加了 ${createdTasks.length} 個新任務。`;
            break;
          case "overwrite":
            message = `成功清除未完成任務並創建了 ${createdTasks.length} 個新任務。`;
            break;
          case "selective":
            message = `成功選擇性更新/創建了 ${createdTasks.length} 個任務。`;
            break;
        }
      } catch (error) {
        actionSuccess = false;
        message = `Task creation failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    // 獲取所有任務用於顯示依賴關係
    try {
      allTasks = await getAllTasks();
    } catch (error) {
      allTasks = [...createdTasks]; // 如果獲取失敗，至少使用剛創建的任務
    }

    // 使用prompt生成器獲取最終prompt
    const prompt = getSplitTasksPrompt({
      updateMode,
      createdTasks,
      allTasks,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
      ephemeral: {
        taskCreationResult: {
          success: actionSuccess,
          message,
          backupFilePath: backupFile,
        },
      },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "Error executing task splitting: " +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    };
  }
}
