import type { ActionContext, ActionEvent, ActionFn, LockKey, RetryOptions } from "./types.ts";

// Internal instruction types yielded to the runner
export type ActionInstruction =
  | ActionEvent
  | { kind: "execute"; name: string; fn: ActionFn<unknown>; retry?: RetryOptions }
  | {
      kind: "execute:parallel";
      actions: readonly { name: string; fn: ActionFn<unknown>; retry?: RetryOptions }[];
    }
  | { kind: "lock:acquire"; key: LockKey }
  | { kind: "lock:release"; key: LockKey }
  | { kind: "context" };

export type StepGenerator<T> = Generator<ActionInstruction, T, unknown>;

export function* step<T>(
  fn: ActionFn<T>,
  options?: { name?: string; retry?: RetryOptions },
): StepGenerator<T> {
  const name = options?.name ?? (fn.name || "anonymous");
  const retry = options?.retry;
  const result = yield {
    kind: "execute" as const,
    name,
    fn: fn as ActionFn<unknown>,
    ...(retry !== undefined ? { retry } : {}),
  };
  return result as T;
}

export function* parallel<T>(
  actions: readonly (ActionFn<T> | { fn: ActionFn<T>; name?: string; retry?: RetryOptions })[],
): StepGenerator<T[]> {
  const normalized = actions.map((item) => {
    if (typeof item === "function") {
      return { name: item.name || "anonymous", fn: item as ActionFn<unknown> };
    }
    const entry: { name: string; fn: ActionFn<unknown>; retry?: RetryOptions } = {
      name: item.name ?? (item.fn.name || "anonymous"),
      fn: item.fn as ActionFn<unknown>,
    };
    if (item.retry !== undefined) {
      entry.retry = item.retry;
    }
    return entry;
  });

  const results = yield { kind: "execute:parallel", actions: normalized };
  return results as T[];
}

export function* useContext(): StepGenerator<ActionContext> {
  const ctx = yield { kind: "context" };
  return ctx as ActionContext;
}

export function* lock<T>(key: LockKey, body: () => StepGenerator<T>): StepGenerator<T> {
  yield { kind: "lock:acquire", key };
  try {
    return yield* body();
  } finally {
    yield { kind: "lock:release", key };
  }
}
