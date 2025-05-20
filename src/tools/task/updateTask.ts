import { z } from "zod";
import { UUID_V4_REGEX } from "../../utils/regex.js";
import {
  getTaskById,
  updateTaskContent as modelUpdateTaskContent,
} from "../../models/taskModel.js";
import { RelatedFileType } from "../../types/index.js";
import { getUpdateTaskContentPrompt } from "../../prompts/index.js";

// Update Task Content Tool
export const updateTaskContentSchema = z.object({
  taskId: z
    .string()
    .regex(UUID_V4_REGEX, {
      message: "Invalid task ID format, please provide a valid UUID v4 format",
    })
    .describe("Unique identifier of the task to be updated, must be a valid and incomplete task ID existing in the system"),
  name: z.string().optional().describe("New task name (optional)"),
  description: z.string().optional().describe("New task description content (optional)"),
  notes: z.string().optional().describe("New supplementary notes for the task (optional)"),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("New task dependencies (optional)"),
  relatedFiles: z
    .array(
      z.object({
        path: z
          .string()
          .min(1, { message: "File path cannot be empty, please provide a valid file path" })
          .describe("File path, can be relative to the project root or absolute path"),
        type: z
          .nativeEnum(RelatedFileType)
          .describe(
            "File relationship type (TO_MODIFY, REFERENCE, CREATE, DEPENDENCY, OTHER)"
          ),
        description: z.string().optional().describe("Supplementary file description (optional)"),
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
  implementationGuide: z
    .string()
    .optional()
    .describe("New implementation guide for the task (optional)"),
  verificationCriteria: z
    .string()
    .optional()
    .describe("New verification criteria for the task (optional)"),
});

export async function updateTaskContent({
  taskId,
  name,
  description,
  notes,
  relatedFiles,
  dependencies,
  implementationGuide,
  verificationCriteria,
}: z.infer<typeof updateTaskContentSchema>) {
  if (relatedFiles) {
    for (const file of relatedFiles) {
      if (
        (file.lineStart && !file.lineEnd) ||
        (!file.lineStart && file.lineEnd) ||
        (file.lineStart && file.lineEnd && file.lineStart > file.lineEnd)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: getUpdateTaskContentPrompt({
                taskId,
                validationError:
                  "Invalid line number setting: Both start and end lines must be set, and the start line must be less than the end line",
              }),
            },
          ],
        };
      }
    }
  }

  if (
    !(
      name ||
      description ||
      notes ||
      dependencies ||
      implementationGuide ||
      verificationCriteria ||
      relatedFiles
    )
  ) {
    return {
      content: [
        {
          type: "text" as const,
          text: getUpdateTaskContentPrompt({
            taskId,
            emptyUpdate: true,
          }),
        },
      ],
    };
  }

  // 獲取任務以檢查它是否存在
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: getUpdateTaskContentPrompt({
            taskId,
          }),
        },
      ],
      isError: true,
    };
  }

  // 記錄要更新的任務和內容
  let updateSummary = `Preparing to update task: ${task.name} (ID: ${task.id})`;
  if (name) updateSummary += `, new name: ${name}`;
  if (description) updateSummary += `, updating description`;
  if (notes) updateSummary += `, updating notes`;
  if (relatedFiles)
    updateSummary += `, updating related files (${relatedFiles.length} files)`;
  if (dependencies)
    updateSummary += `, updating dependencies (${dependencies.length} dependencies)`;
  if (implementationGuide) updateSummary += `, updating implementation guide`;
  if (verificationCriteria) updateSummary += `, updating verification criteria`;

  // 執行更新操作
  const result = await modelUpdateTaskContent(taskId, {
    name,
    description,
    notes,
    relatedFiles,
    dependencies,
    implementationGuide,
    verificationCriteria,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: getUpdateTaskContentPrompt({
          taskId,
          task,
          success: result.success,
          message: result.message,
          updatedTask: result.task,
        }),
      },
    ],
    isError: !result.success,
  };
}
