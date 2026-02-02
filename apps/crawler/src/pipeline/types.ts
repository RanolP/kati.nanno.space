export type TaskFn<T> = () => Promise<T>;

export type PipelineEvent =
  | { kind: "task:start"; name: string }
  | { kind: "task:progress"; name: string; message: string }
  | { kind: "task:done"; name: string }
  | { kind: "task:error"; name: string; error: unknown };

export interface RetryOptions {
  readonly retries: number;
  readonly backoff?: "fixed" | "exponential";
  readonly delayMs?: number;
}

export type LockKey = readonly [string, ...string[]];

export interface PipelineContext {
  readonly lockManager: LockManager;
}

export interface LockManager {
  acquire(key: LockKey): Promise<() => void>;
}

export type PipelineGenerator<T> = Generator<PipelineEvent, T, unknown>;

export interface Pipeline<T> {
  readonly name: string;
  run(ctx: PipelineContext): PipelineGenerator<T>;
}
