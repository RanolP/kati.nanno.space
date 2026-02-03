import type {
  Err as ErrType,
  Ok as OkType,
  Task,
  TaskContext,
  TaskInstruction,
  TaskResult,
  WorkContext,
} from "./types.ts";

// --- Result Constructors ---

export const Ok = <T>(data: T): OkType<T> => ({ ok: true, data });
export const Err = (error: Error): ErrType => ({ ok: false, error });

// --- Task Factory ---

export function task<T>(
  name: string,
  run: () => Generator<TaskInstruction, TaskResult<T>, unknown>,
): Task<T> {
  return { name, run };
}

// --- Task Generator Type ---

export type TaskGenerator<T> = Generator<TaskInstruction, T, unknown>;

// --- Yield Another Task (Dependency) ---

export function* yieldTask<T>(t: Task<T>): TaskGenerator<T> {
  const result = yield { kind: "yieldTask", task: t as Task<unknown> };
  return result as T;
}

// --- Spawn Child Tasks (Concurrent, Parent Waits) ---

export function* spawn(tasks: readonly Task<unknown>[]): TaskGenerator<TaskResult<unknown>[]> {
  const results = yield { kind: "spawn", tasks };
  return results as TaskResult<unknown>[];
}

// --- Get Context ---

export function* useContext(): TaskGenerator<TaskContext> {
  const ctx = yield { kind: "context" };
  return ctx as TaskContext;
}

// --- Unital Work with Progress ---

export function* work<T>(fn: (ctx: WorkContext) => Promise<T>): TaskGenerator<T> {
  const result = yield { kind: "work", fn: fn as (ctx: WorkContext) => Promise<unknown> };
  return result as T;
}
