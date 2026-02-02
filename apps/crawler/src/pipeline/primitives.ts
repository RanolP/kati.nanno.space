import type { LockKey, PipelineEvent, RetryOptions, TaskFn } from "./types.ts";

// Internal instruction types yielded to the runner
export type PipelineInstruction =
  | PipelineEvent
  | { kind: "execute"; name: string; fn: TaskFn<unknown>; retry?: RetryOptions }
  | {
      kind: "execute:parallel";
      tasks: readonly { name: string; fn: TaskFn<unknown>; retry?: RetryOptions }[];
    }
  | { kind: "lock:acquire"; key: LockKey }
  | { kind: "lock:release"; key: LockKey };

export type StepGenerator<T> = Generator<PipelineInstruction, T, unknown>;

export function* step<T>(
  fn: TaskFn<T>,
  options?: { name?: string; retry?: RetryOptions },
): StepGenerator<T> {
  const name = options?.name ?? (fn.name || "anonymous");
  const retry = options?.retry;
  const result = yield {
    kind: "execute" as const,
    name,
    fn: fn as TaskFn<unknown>,
    ...(retry !== undefined ? { retry } : {}),
  };
  return result as T;
}

export function* parallel<T>(
  tasks: readonly (TaskFn<T> | { fn: TaskFn<T>; name?: string; retry?: RetryOptions })[],
): StepGenerator<T[]> {
  const normalized = tasks.map((task) => {
    if (typeof task === "function") {
      return { name: task.name || "anonymous", fn: task as TaskFn<unknown> };
    }
    const entry: { name: string; fn: TaskFn<unknown>; retry?: RetryOptions } = {
      name: task.name ?? (task.fn.name || "anonymous"),
      fn: task.fn as TaskFn<unknown>,
    };
    if (task.retry !== undefined) {
      entry.retry = task.retry;
    }
    return entry;
  });

  const results = yield { kind: "execute:parallel", tasks: normalized };
  return results as T[];
}

export function* lock<T>(key: LockKey, body: () => StepGenerator<T>): StepGenerator<T> {
  yield { kind: "lock:acquire", key };
  try {
    return yield* body();
  } finally {
    yield { kind: "lock:release", key };
  }
}
