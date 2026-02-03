import type { RunResult } from "../features/task/index.ts";

export type { TaskEvent } from "../features/task/index.ts";

export interface TaskEntry {
  readonly name: string;
  readonly result: RunResult<unknown>;
}

export type TaskStatus = "pending" | "running" | "done" | "error";

export interface WorkState {
  name: string;
  status: TaskStatus;
  description?: string;
  progress?: "indefinite" | number;
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
