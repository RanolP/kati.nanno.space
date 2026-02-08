import { resolve } from "node:path";

import { object, or } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { argument, command, constant } from "@optique/core/primitives";
import { string } from "@optique/core/valueparser";
import { run } from "@optique/run";

import { createSession, runTask } from "./features/task/index.ts";
import type { PersistConfig, Task, TaskContextType } from "./features/task/index.ts";
import type { CollectionModel, Infer } from "./features/model/index.ts";
import { renderTasks } from "./ui.tsx";

async function runTasks(createTasks: (() => Task<unknown>)[]): Promise<void> {
  const session = createSession({} as TaskContextType);
  const entries = createTasks.map((create) => {
    const t = create();
    return { name: t.name, result: runTask(t, session) };
  });
  await renderTasks(entries);
  process.exit(0);
}

const boothInfoCommands = or(
  command(
    "fetch",
    object({ action: constant("fetch" as const), url: argument(string({ metavar: "URL" })) }),
  ),
  command(
    "review",
    object({
      action: constant("review" as const),
      hash: optional(argument(string({ metavar: "HASH" }))),
    }),
  ),
);

const parser = or(
  command(
    "booth-info",
    object({ command: constant("booth-info" as const), sub: boothInfoCommands }),
  ),
  command("illustar", object({ command: constant("illustar" as const) })),
  command("find-info", object({ command: constant("find-info" as const) })),
);

const result = run(parser, { help: "both", programName: "pnpm crawl" });

if (result.command === "booth-info") {
  const { sub } = result;

  if (sub.action === "fetch") {
    const { boothInfoFetch } = await import("./app/booth-info-fetch.ts");
    await runTasks([() => boothInfoFetch(sub.url)]);
  } else {
    const { discoverReviewHash } = await import("./app/booth-info-shared.ts");
    const hash = sub.hash ?? (await discoverReviewHash());
    if (!hash) {
      console.error("No hash to review. Provide a HASH or fetch an image first.");
      process.exit(1);
    }
    console.log(`Reviewing ${hash.slice(0, 12)}…`);
    const { boothInfoReview } = await import("./app/booth-info-review.tsx");
    await runTasks([() => boothInfoReview(hash)]);
  }
} else if (result.command === "illustar") {
  const { illustarTasks } = await import("./app/illustar.ts");
  const { persist } = await import("./app/persist.ts");
  const { createFetcher } = await import("./services/endpoint.ts");

  const dataDir = resolve(import.meta.dirname!, "../../../data/illustar");
  const fetcher = createFetcher();

  const persistFn = async (config: PersistConfig, data: unknown): Promise<void> => {
    await persist(
      config.model as CollectionModel,
      data as Infer<CollectionModel>,
      config.name,
      dataDir,
    );
  };

  const session = createSession({ fetcher } as TaskContextType, { persist: persistFn });

  const entries = illustarTasks.map((createTask) => {
    const task = createTask();
    const resultEntry = runTask(task as Task<unknown>, session);
    return { name: task.name, result: resultEntry };
  });

  await renderTasks(entries);
  process.exit(0);
} else {
  const { findInfo } = await import("./app/find-info.ts");
  const { createFetcher } = await import("./services/endpoint.ts");
  const { TwitterChannel } = await import("./services/twitter/index.ts");

  const fetcher = createFetcher();
  const twitterChannel = new TwitterChannel();
  const session = createSession({ fetcher, twitterChannel });

  const t = findInfo();
  const entries = [{ name: t.name, result: runTask(t as Task<unknown>, session) }];
  await renderTasks(entries);
  process.exit(0);
}
