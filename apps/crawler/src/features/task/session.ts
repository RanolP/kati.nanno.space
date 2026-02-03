import type { TaskContext, TaskEvent, TaskResult } from "./types.ts";

export interface Session {
  readonly context: TaskContext;
  readonly cache: Map<string, Promise<TaskResult<unknown>>>;
  emit(event: TaskEvent): void;
  subscribe(): AsyncIterableIterator<TaskEvent>;
}

export function createSession(context: TaskContext): Session {
  const cache = new Map<string, Promise<TaskResult<unknown>>>();

  // Event broadcasting
  const subscribers = new Set<{
    queue: TaskEvent[];
    resolve: (() => void) | undefined;
    done: boolean;
  }>();

  function emit(event: TaskEvent): void {
    for (const sub of subscribers) {
      sub.queue.push(event);
      sub.resolve?.();
    }
  }

  function subscribe(): AsyncIterableIterator<TaskEvent> {
    const state = {
      queue: [] as TaskEvent[],
      resolve: undefined as (() => void) | undefined,
      done: false,
    };
    subscribers.add(state);

    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next(): Promise<IteratorResult<TaskEvent>> {
        while (state.queue.length === 0) {
          if (state.done) {
            return { done: true, value: undefined };
          }
          await new Promise<void>((resolve) => {
            state.resolve = resolve;
          });
          state.resolve = undefined;
        }
        return { done: false, value: state.queue.shift()! };
      },
      return(): Promise<IteratorResult<TaskEvent>> {
        state.done = true;
        subscribers.delete(state);
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  }

  return {
    context,
    cache,
    emit,
    subscribe,
  };
}

export function closeSession(_session: Session): void {
  // Signal to all subscribers that the session is done
  // This is a no-op for now since subscribers handle their own lifecycle
  // but could be extended to support graceful shutdown
}
