import type { Task, TaskEvent, TaskInstruction, TaskResult, WorkContext } from "./types.ts";
import type { Session } from "./session.ts";
import { Err } from "./primitives.ts";

export interface RunResult<T> {
  events: AsyncIterable<TaskEvent>;
  result: Promise<TaskResult<T>>;
}

export function runTask<T>(task: Task<T>, session: Session): RunResult<T> {
  const events = session.subscribe();

  const result = executeTask(task, session);

  return { events, result };
}

async function executeTask<T>(
  task: Task<T>,
  session: Session,
  spawned = false,
): Promise<TaskResult<T>> {
  // Check cache first
  const cached = session.cache.get(task.name);
  if (cached) {
    return cached as Promise<TaskResult<T>>;
  }

  // Create the promise and cache it immediately for deduplication
  const promise = runTaskInternal(task, session, spawned);
  session.cache.set(task.name, promise as Promise<TaskResult<unknown>>);

  return promise;
}

async function runTaskInternal<T>(
  task: Task<T>,
  session: Session,
  spawned: boolean,
): Promise<TaskResult<T>> {
  session.emit({ kind: "taskStart", name: task.name, timestamp: Date.now() });

  try {
    const gen = task.run();
    let nextValue: unknown;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const { value, done } = gen.next(nextValue);

      if (done) {
        const result = value as TaskResult<T>;

        // Persist on success if task has persist config and is not spawned
        if (result.ok && task.persist && session.persist && !spawned) {
          await session.persist(task.persist, result.data);
        }

        session.emit({ kind: "taskEnd", name: task.name, result, timestamp: Date.now() });
        return result;
      }

      const instruction = value as TaskInstruction;
      nextValue = await processInstruction(instruction, task.name, session);
    }
  } catch (error) {
    const result = Err(error instanceof Error ? error : new Error(String(error)));
    session.emit({ kind: "taskEnd", name: task.name, result, timestamp: Date.now() });
    return result as TaskResult<T>;
  }
}

async function processInstruction(
  instruction: TaskInstruction,
  currentTaskName: string,
  session: Session,
): Promise<unknown> {
  switch (instruction.kind) {
    case "yieldTask": {
      session.emit({
        kind: "taskDependency",
        task: currentTaskName,
        dependsOn: instruction.task.name,
      });
      const result = await executeTask(instruction.task, session);
      if (!result.ok) {
        throw result.error;
      }
      return result.data;
    }

    case "spawn": {
      const childNames = instruction.tasks.map((t) => t.name);
      session.emit({ kind: "spawnStart", parent: currentTaskName, children: childNames });

      const results = await Promise.all(
        instruction.tasks.map((t) => executeTask(t, session, true)),
      );

      session.emit({ kind: "spawnEnd", parent: currentTaskName });
      return results;
    }

    case "context": {
      return session.context;
    }

    case "work": {
      let emittedStart = false;

      const workCtx: WorkContext = {
        description(str: string) {
          if (!emittedStart) {
            session.emit({ kind: "workStart", task: currentTaskName, description: str });
            emittedStart = true;
          }
        },
        progress(value: "indefinite" | number) {
          session.emit({ kind: "workProgress", task: currentTaskName, value });
        },
      };

      // Emit workStart if not already emitted by description()
      const emitStartIfNeeded = () => {
        if (!emittedStart) {
          session.emit({ kind: "workStart", task: currentTaskName });
          emittedStart = true;
        }
      };

      try {
        // Start the work - description() may be called synchronously
        const resultPromise = instruction.fn(workCtx);
        emitStartIfNeeded();
        const result = await resultPromise;
        session.emit({ kind: "workEnd", task: currentTaskName });
        return result;
      } catch (error) {
        emitStartIfNeeded();
        session.emit({ kind: "workEnd", task: currentTaskName });
        throw error;
      }
    }
  }
}
