import { resolve } from "node:path";

import { object, or } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { argument, command, constant } from "@optique/core/primitives";
import { string } from "@optique/core/valueparser";
import { run } from "@optique/run";

import { createSession, runTask } from "./features/task/index.ts";
import type { PersistConfig, Task, TaskContextType } from "./features/task/index.ts";
import type { CollectionModel, Infer } from "./features/model/index.ts";
import { renderTasks } from "./features/task/ui/index.ts";

async function runTasks(createTasks: (() => Task<unknown>)[]): Promise<void> {
  const session = createSession({} as TaskContextType);
  const entries = createTasks.map((create) => {
    const t = create();
    return { name: t.name, result: runTask(t, session) };
  });
  await renderTasks(entries);
}

const parser = or(
  command(
    "review-info",
    object({
      command: constant("review-info" as const),
      hash: optional(argument(string({ metavar: "HASH" }))),
    }),
  ),
  command("illustar", object({ command: constant("illustar" as const) })),
  command("find-info", object({ command: constant("find-info" as const) })),
  command("analyze-info", object({ command: constant("analyze-info" as const) })),
  command("extract-relations", object({ command: constant("extract-relations" as const) })),
);

const result = run(parser, { help: "both", programName: "pnpm crawl" });

if (result.command === "review-info") {
  const { discoverReviewHash, isReviewEligible, readBoothImageMeta, REVIEW_MIN_CONFIDENCE } =
    await import("./app/review-info/shared.ts");
  const { boothInfoReview } = await import("./app/review-info/index.ts");

  const reviewOne = async (hash: string): Promise<boolean> => {
    if (!(await isReviewEligible(hash))) {
      const meta = await readBoothImageMeta(hash);
      const confidence = meta?.confidence ?? 0;
      console.error(
        `Hash ${hash.slice(0, 12)} is below confidence threshold (${confidence} < ${REVIEW_MIN_CONFIDENCE}).`,
      );
      return false;
    }
    console.log(`Reviewing ${hash.slice(0, 12)}…`);
    console.log(`Review URL (once ready): http://localhost:3001/review/${hash}/0`);
    await runTasks([() => boothInfoReview(hash)]);
    return true;
  };

  if (result.hash) {
    if (!(await reviewOne(result.hash))) process.exit(1);
    process.exit(0);
  }

  let hash = await discoverReviewHash();
  if (!hash) {
    console.error(
      `No eligible hash to review (confidence >= ${REVIEW_MIN_CONFIDENCE}). Provide a HASH or run analyze-info first.`,
    );
    process.exit(1);
  }

  // Keep reviewing sequentially until all eligible hashes are done.
  while (hash) {
    if (!(await reviewOne(hash))) process.exit(1);
    hash = await discoverReviewHash();
    if (hash) console.log(`Continuing with next hash ${hash.slice(0, 12)}…`);
  }
  console.log("No more eligible hashes to review.");
  process.exit(0);
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
} else if (result.command === "analyze-info") {
  const { analyzeInfo } = await import("./app/analyze-info/index.ts");
  const { TwitterChannel } = await import("./services/twitter/index.ts");
  const apiKey = process.env.CRAWLER_TWITTER_API_KEY;
  const twitter = apiKey ? new TwitterChannel({ apiKey }) : undefined;
  await runTasks([() => analyzeInfo(twitter)]);
  process.exit(0);
} else if (result.command === "extract-relations") {
  const { extractRelations } = await import("./app/extract-relations.ts");
  await runTasks([() => extractRelations()]);
  process.exit(0);
} else {
  const { findInfo } = await import("./app/find-info/index.ts");
  const { createFetcher } = await import("./services/endpoint.ts");
  const { TwitterChannel } = await import("./services/twitter/index.ts");

  const fetcher = createFetcher();
  const apiKey = process.env.CRAWLER_TWITTER_API_KEY;
  const twitterChannel = new TwitterChannel(apiKey ? { apiKey } : undefined);
  const session = createSession({ fetcher, twitterChannel });

  const t = findInfo();
  const entries = [{ name: t.name, result: runTask(t as Task<unknown>, session) }];
  await renderTasks(entries);
  process.exit(0);
}
