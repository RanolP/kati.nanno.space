import type { LockManager, PipelineContext, PipelineEvent, RetryOptions, TaskFn } from "./types.ts";
import type { PipelineInstruction, StepGenerator } from "./primitives.ts";
import { createLockManager } from "./lock-manager.ts";

interface PipelineDefinition<T> {
  readonly name: string;
  readonly body: () => StepGenerator<T>;
}

export function pipeline<T>(name: string, body: () => StepGenerator<T>): PipelineDefinition<T> {
  return { name, body };
}

export interface PipelineResult<T> {
  readonly events: AsyncIterable<PipelineEvent>;
  readonly result: Promise<T>;
}

async function executeWithRetry<T>(fn: TaskFn<T>, retry?: RetryOptions): Promise<T> {
  const maxAttempts = (retry?.retries ?? 0) + 1;
  const baseDelay = retry?.delayMs ?? 1000;
  const backoff = retry?.backoff ?? "fixed";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt + 1 >= maxAttempts) throw error;
      const delay = backoff === "exponential" ? baseDelay * 2 ** attempt : baseDelay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}

export function run<T>(
  def: PipelineDefinition<T>,
  ctx?: Partial<PipelineContext>,
): PipelineResult<T> {
  const lockManager: LockManager = ctx?.lockManager ?? createLockManager();
  const activeLocks = new Map<string, () => void>();

  // Event channel
  const eventQueue: PipelineEvent[] = [];
  let eventResolve: (() => void) | undefined;
  let done = false;

  function pushEvent(event: PipelineEvent): void {
    eventQueue.push(event);
    eventResolve?.();
  }

  const events: AsyncIterable<PipelineEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<PipelineEvent>> {
          while (eventQueue.length === 0) {
            if (done) return { done: true, value: undefined };
            await new Promise<void>((resolve) => {
              eventResolve = resolve;
            });
          }
          return { done: false, value: eventQueue.shift()! };
        },
      };
    },
  };

  const result = (async (): Promise<T> => {
    const gen = def.body();
    let nextValue: unknown;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const { value, done: genDone } = gen.next(nextValue);

      if (genDone) {
        done = true;
        eventResolve?.();
        return value as T;
      }

      const instruction = value as PipelineInstruction;
      nextValue = await processInstruction(instruction, lockManager, activeLocks, pushEvent);
    }
  })();

  return { events, result };
}

async function processInstruction(
  instruction: PipelineInstruction,
  lockManager: LockManager,
  activeLocks: Map<string, () => void>,
  pushEvent: (event: PipelineEvent) => void,
): Promise<unknown> {
  switch (instruction.kind) {
    case "execute": {
      pushEvent({ kind: "task:start", name: instruction.name });
      try {
        const result = await executeWithRetry(instruction.fn, instruction.retry);
        pushEvent({ kind: "task:done", name: instruction.name });
        return result;
      } catch (error) {
        pushEvent({ kind: "task:error", name: instruction.name, error });
        throw error;
      }
    }

    case "execute:parallel": {
      for (const task of instruction.tasks) {
        pushEvent({ kind: "task:start", name: task.name });
      }

      const promises = instruction.tasks.map(async (task) => {
        try {
          const result = await executeWithRetry(task.fn, task.retry);
          pushEvent({ kind: "task:done", name: task.name });
          return result;
        } catch (error) {
          pushEvent({ kind: "task:error", name: task.name, error });
          throw error;
        }
      });

      return Promise.all(promises);
    }

    case "lock:acquire": {
      const keyStr = instruction.key.join("\0");
      const release = await lockManager.acquire(instruction.key);
      activeLocks.set(keyStr, release);
      return undefined;
    }

    case "lock:release": {
      const keyStr = instruction.key.join("\0");
      const release = activeLocks.get(keyStr);
      if (release) {
        activeLocks.delete(keyStr);
        release();
      }
      return undefined;
    }

    default: {
      // Regular PipelineEvent — forward to stream
      pushEvent(instruction as PipelineEvent);
      return undefined;
    }
  }
}
