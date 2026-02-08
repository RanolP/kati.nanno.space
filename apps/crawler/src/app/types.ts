import type { RunResult, ProgressValue } from "../features/task/index.ts";

export type { TaskEvent, ProgressValue } from "../features/task/index.ts";

export interface TaskEntry {
  readonly name: string;
  readonly result: RunResult<unknown>;
}

export type TaskStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface WorkState {
  name: string;
  status: TaskStatus;
  description?: string;
  progress?: ProgressValue;
  error?: unknown;
}

export interface TaskState {
  status: TaskStatus;
  works: WorkState[];
  children: string[];
  dependencies: string[];
  startedAt?: number;
  endedAt?: number;
  error?: unknown;
}
