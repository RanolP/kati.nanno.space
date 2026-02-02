import type { ActionContext, ActionEvent, ActionFn, RetryOptions } from "./types.ts";

import type { ActionInstruction, StepGenerator } from "./primitives.ts";
import { createLockManager } from "./lock-manager.ts";

interface ActionDefinition<T> {
  readonly name: string;
  readonly body: () => StepGenerator<T>;
}

export function action<T>(name: string, body: () => StepGenerator<T>): ActionDefinition<T> {
  return { name, body };
}

export interface ActionResult<T> {
  readonly events: AsyncIterable<ActionEvent>;
  readonly result: Promise<T>;
}

async function executeWithRetry<T>(fn: ActionFn<T>, retry?: RetryOptions): Promise<T> {
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

export function run<T>(def: ActionDefinition<T>, ctx?: Partial<ActionContext>): ActionResult<T> {
  const resolvedCtx = {
    lockManager: ctx?.lockManager ?? createLockManager(),
    ...ctx,
  } as ActionContext;
  const activeLocks = new Map<string, () => void>();

  // Event channel
  const eventQueue: ActionEvent[] = [];
  let eventResolve: (() => void) | undefined;
  let done = false;

  function pushEvent(event: ActionEvent): void {
    eventQueue.push(event);
    eventResolve?.();
  }

  const events: AsyncIterable<ActionEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<ActionEvent>> {
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

      const instruction = value as ActionInstruction;
      try {
        nextValue = await processInstruction(instruction, resolvedCtx, activeLocks, pushEvent);
      } catch (error) {
        done = true;
        eventResolve?.();
        throw error;
      }
    }
  })();

  return { events, result };
}

async function processInstruction(
  instruction: ActionInstruction,
  ctx: ActionContext,
  activeLocks: Map<string, () => void>,
  pushEvent: (event: ActionEvent) => void,
): Promise<unknown> {
  switch (instruction.kind) {
    case "execute": {
      pushEvent({ kind: "action:start", name: instruction.name });
      try {
        const result = await executeWithRetry(instruction.fn, instruction.retry);
        pushEvent({ kind: "action:done", name: instruction.name });
        return result;
      } catch (error) {
        pushEvent({ kind: "action:error", name: instruction.name, error });
        throw error;
      }
    }

    case "execute:parallel": {
      for (const item of instruction.actions) {
        pushEvent({ kind: "action:start", name: item.name });
      }

      const promises = instruction.actions.map(async (item) => {
        try {
          const result = await executeWithRetry(item.fn, item.retry);
          pushEvent({ kind: "action:done", name: item.name });
          return result;
        } catch (error) {
          pushEvent({ kind: "action:error", name: item.name, error });
          throw error;
        }
      });

      return Promise.all(promises);
    }

    case "lock:acquire": {
      const keyStr = instruction.key.join("\0");
      const release = await ctx.lockManager.acquire(instruction.key);
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

    case "context": {
      return ctx;
    }

    default: {
      // Regular ActionEvent — forward to stream
      pushEvent(instruction as ActionEvent);
      return undefined;
    }
  }
}
