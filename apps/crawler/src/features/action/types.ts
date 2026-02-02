export type ActionFn<T> = () => Promise<T>;

export type ActionEvent =
  | { kind: "action:start"; name: string }
  | { kind: "action:progress"; name: string; message: string }
  | { kind: "action:done"; name: string }
  | { kind: "action:error"; name: string; error: unknown };

export interface RetryOptions {
  readonly retries: number;
  readonly backoff?: "fixed" | "exponential";
  readonly delayMs?: number;
}

export type LockKey = readonly [string, ...string[]];

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ActionContext {
  readonly lockManager: LockManager;
}

export interface LockManager {
  acquire(key: LockKey): Promise<() => void>;
}

export type ActionGenerator<T> = Generator<ActionEvent, T, unknown>;

export interface Action<T> {
  readonly name: string;
  run(ctx: ActionContext): ActionGenerator<T>;
}
