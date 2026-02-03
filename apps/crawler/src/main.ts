import { dirname, resolve } from "node:path";
import { illustarTasks } from "./app/illustar.ts";
import { persist } from "./app/persist.ts";
import { createFetcher } from "./services/endpoint.ts";
import { createSession, runTask } from "./features/task/index.ts";
import type { PersistConfig, Task } from "./features/task/index.ts";
import type { CollectionModel, Infer } from "./features/model/index.ts";
import { fileURLToPath } from "node:url";
import { renderTasks } from "./ui.tsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../../../data/illustar");

const fetcher = createFetcher();

const persistFn = async (config: PersistConfig, data: unknown): Promise<void> => {
  await persist(
    config.model as CollectionModel,
    data as Infer<CollectionModel>,
    config.name,
    dataDir,
  );
};

const session = createSession({ fetcher }, { persist: persistFn });

const entries = illustarTasks.map((createTask) => {
  const task = createTask();
  const result = runTask(task as Task<unknown>, session);
  return { name: task.name, result };
});

await renderTasks(entries);

process.exit(0);
