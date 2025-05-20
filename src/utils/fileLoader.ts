import { RelatedFile, RelatedFileType } from "../types/index.js";

/**
 * Generates a content summary for task-related files.
 *
 * This function generates summary information for files based on the provided list of RelatedFile objects, without actually reading the file content.
 * This is a lightweight implementation that generates a formatted summary based only on file metadata (such as path, type, description, etc.),
 * suitable for scenarios where file context information is needed but access to the actual file content is not required.
 *
 * @param relatedFiles List of related files - An array of RelatedFile objects containing information about the file's path, type, description, etc.
 * @param maxTotalLength Maximum total length of the summary content - Controls the total number of characters in the generated summary to avoid excessively large return content.
 * @returns An object containing two fields:
 *   - content: Detailed file information, including basic information and prompt messages for each file.
 *   - summary: A concise overview of the file list, suitable for quick browsing.
 */
export async function loadTaskRelatedFiles(
  relatedFiles: RelatedFile[],
  maxTotalLength: number = 15000 // Controls the total length of the generated content.
): Promise<{ content: string; summary: string }> {
  if (!relatedFiles || relatedFiles.length === 0) {
    return {
      content: "",
      summary: "No related files",
    };
  }

  let totalContent = "";
  let filesSummary = `## Related File Content Summary (${relatedFiles.length} files)\n\n`;
  let totalLength = 0;

  // Sort by file type priority (process files to be modified first)
  const priorityOrder: Record<RelatedFileType, number> = {
    [RelatedFileType.TO_MODIFY]: 1,
    [RelatedFileType.REFERENCE]: 2,
    [RelatedFileType.DEPENDENCY]: 3,
    [RelatedFileType.CREATE]: 4,
    [RelatedFileType.OTHER]: 5,
  };

  const sortedFiles = [...relatedFiles].sort(
    (a, b) => priorityOrder[a.type] - priorityOrder[b.type]
  );

  // Process each file
  for (const file of sortedFiles) {
    if (totalLength >= maxTotalLength) {
      filesSummary += `\n### Context length limit reached, some files not loaded\n`;
      break;
    }

    // Generate basic file information
    const fileInfo = generateFileInfo(file);

    // Add to total content
    const fileHeader = `\n### ${file.type}: ${file.path}${
      file.description ? ` - ${file.description}` : ""
    }${
      file.lineStart && file.lineEnd
        ? ` (Lines ${file.lineStart}-${file.lineEnd})`
        : ""
    }\n\n`;

    totalContent += fileHeader + "```\n" + fileInfo + "\n```\n\n";
    filesSummary += `- **${file.path}**${
      file.description ? ` - ${file.description}` : ""
    } (${fileInfo.length} characters)\n`;

    totalLength += fileInfo.length + fileHeader.length + 8; // 8 for "```\n" and "\n```"
  }

  return {
    content: totalContent,
    summary: filesSummary,
  };
}

/**
 * Generates a basic information summary for a file.
 *
 * Generates a formatted information summary based on the file's metadata, including file path, type, and related prompts.
 * Does not read the actual file content, only generates information based on the provided RelatedFile object.
 *
 * @param file Related file object - Contains basic information such as file path, type, and description.
 * @returns Formatted file information summary text.
 */
function generateFileInfo(file: RelatedFile): string {
  let fileInfo = `File: ${file.path}\n`;
  fileInfo += `Type: ${file.type}\n`;

  if (file.description) {
    fileInfo += `Description: ${file.description}\n`;
  }

  if (file.lineStart && file.lineEnd) {
    fileInfo += `Line Range: ${file.lineStart}-${file.lineEnd}\n`;
  }

  fileInfo += `To view actual content, please directly view the file: ${file.path}\n`;

  return fileInfo;
}
