// --- Result Types ---

export type TaskResult<T> = Err | Ok<T>;
export interface Err {
  readonly ok: false;
  readonly error: Error;
}
export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
}

// --- Task Definition ---

export interface Task<T> {
  readonly name: string;
  readonly run: () => Generator<TaskInstruction, TaskResult<T>, unknown>;
}

// --- Context (extensible via module augmentation) ---

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TaskContext {}

// --- Work Context for Progress Reporting ---

export interface WorkContext {
  description(str: string): void;
  progress(value: "indefinite" | number): void;
}

// --- Task Instructions (yielded to runner) ---

export type TaskInstruction =
  | { kind: "yieldTask"; task: Task<unknown> }
  | { kind: "spawn"; tasks: readonly Task<unknown>[] }
  | { kind: "context" }
  | { kind: "work"; fn: (ctx: WorkContext) => Promise<unknown> };

// --- Task Events (emitted by runner only) ---

export type TaskEvent =
  | { kind: "taskStart"; name: string }
  | { kind: "taskEnd"; name: string; result: TaskResult<unknown> }
  | { kind: "workStart"; task: string; description?: string }
  | { kind: "workProgress"; task: string; value: "indefinite" | number }
  | { kind: "workEnd"; task: string }
  | { kind: "spawnStart"; parent: string; children: readonly string[] }
  | { kind: "spawnEnd"; parent: string };
