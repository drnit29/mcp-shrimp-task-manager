// Task Status Enum: Defines the current stage of a task in the workflow
export enum TaskStatus {
  PENDING = "pending", // Task has been created but not yet started
  IN_PROGRESS = "in_progress", // Task is currently being executed
  COMPLETED = "completed", // Task has been successfully completed and verified
  BLOCKED = "blocked", // Task is temporarily blocked due to dependencies
}

// Task Dependency: Defines prerequisite relationships between tasks
export interface TaskDependency {
  taskId: string; // Unique identifier of the prerequisite task; this dependency must be completed before the current task can execute
}

// Related File Type: Defines the relationship type between a file and a task
export enum RelatedFileType {
  TO_MODIFY = "TO_MODIFY", // File that needs to be modified in the task
  REFERENCE = "REFERENCE", // Reference material or related document for the task
  CREATE = "CREATE", // File that needs to be created in the task
  DEPENDENCY = "DEPENDENCY", // Component or library file that the task depends on
  OTHER = "OTHER", // Other types of related files
}

// Related File: Defines information about files related to a task
export interface RelatedFile {
  path: string; // File path, can be relative to the project root or absolute
  type: RelatedFileType; // Type of relationship between the file and the task
  description?: string; // Supplementary description of the file, explaining its specific relationship or purpose to the task
  lineStart?: number; // Starting line of the relevant code block (optional)
  lineEnd?: number; // Ending line of the relevant code block (optional)
}

// Task Interface: Defines the complete data structure of a task
export interface Task {
  id: string; // Unique identifier for the task
  name: string; // Concise and clear task name
  description: string; // Detailed task description, including implementation points and acceptance criteria
  notes?: string; // Supplementary notes, special handling requirements, or implementation suggestions (optional)
  status: TaskStatus; // Current execution status of the task
  dependencies: TaskDependency[]; // List of prerequisite dependencies for the task
  createdAt: Date; // Timestamp when the task was created
  updatedAt: Date; // Timestamp when the task was last updated
  completedAt?: Date; // Timestamp when the task was completed (only for completed tasks)
  summary?: string; // Summary of task completion, concisely describing implementation results and important decisions (only for completed tasks)
  relatedFiles?: RelatedFile[]; // List of files related to the task (optional)

  // New field: Stores the complete technical analysis result
  analysisResult?: string; // Complete analysis result from the analyze_task and reflect_task stages

  // New field: Stores the specific implementation guide
  implementationGuide?: string; // Specific implementation methods, steps, and suggestions

  // New field: Stores verification standards and testing methods
  verificationCriteria?: string; // Clear verification standards, testing points, and acceptance criteria
}

// Task Complexity Level: Defines the classification of task complexity
export enum TaskComplexityLevel {
  LOW = "low_complexity", // Simple and straightforward tasks, usually require no special handling
  MEDIUM = "medium_complexity", // Tasks with some complexity but still manageable
  HIGH = "high_complexity", // Complex and time-consuming tasks, require special attention
  VERY_HIGH = "very_high_complexity", // Extremely complex tasks, recommended for splitting
}

// Task Complexity Thresholds: Defines reference standards for task complexity assessment
export const TaskComplexityThresholds = {
  DESCRIPTION_LENGTH: {
    MEDIUM: 500, // Exceeding this character count is considered medium complexity
    HIGH: 1000, // Exceeding this character count is considered high complexity
    VERY_HIGH: 2000, // Exceeding this character count is considered very high complexity
  },
  DEPENDENCIES_COUNT: {
    MEDIUM: 2, // Exceeding this dependency count is considered medium complexity
    HIGH: 5, // Exceeding this dependency count is considered high complexity
    VERY_HIGH: 10, // Exceeding this dependency count is considered very high complexity
  },
  NOTES_LENGTH: {
    MEDIUM: 200, // Exceeding this character count is considered medium complexity
    HIGH: 500, // Exceeding this character count is considered high complexity
    VERY_HIGH: 1000, // Exceeding this character count is considered very high complexity
  },
};

// Task Complexity Assessment Result: Records detailed results of task complexity analysis
export interface TaskComplexityAssessment {
  level: TaskComplexityLevel; // Overall complexity level
  metrics: {
    // Detailed data for each assessment metric
    descriptionLength: number; // Description length
    dependenciesCount: number; // Dependency count
    notesLength: number; // Notes length
    hasNotes: boolean; // Whether there are notes
  };
  recommendations: string[]; // List of processing recommendations
}
