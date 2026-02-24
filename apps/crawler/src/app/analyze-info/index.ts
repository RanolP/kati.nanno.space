import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import sharp from "sharp";

import { Ok, task, work } from "../../features/task/index.ts";
import type { Task } from "../../features/task/index.ts";
import { classifyMedia, readTweet } from "../../services/restate/client.ts";
import { boothInfoPaths } from "../review-info/shared.ts";
import type { BoothImageMeta } from "../review-info/shared.ts";
import { loadAnalyzeCheckpoint, saveAnalyzeCheckpoint } from "./checkpoint.ts";
import { loadUserRawTweets, saveUserRawTweets } from "../raw-tweets-io.ts";
import type { RawTweetsFile } from "../raw-tweets-io.ts";
import type { TwitterChannel } from "../../services/twitter/index.ts";

const DATA_DIR = resolve(import.meta.dirname!, "../../../../../data");
const FIND_INFO_DIR = join(DATA_DIR, "find-info");
const RAW_TWEETS_DIR = join(FIND_INFO_DIR, "raw-tweets");
const CHECKPOINT_PATH = join(FIND_INFO_DIR, ".analyze-checkpoint.json");
const RESTATE_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.CRAWLER_RESTATE_CONCURRENCY ?? "8", 10) || 8,
);

/** Pending image waiting for batch classification. */
interface CollectedImage {
  mediaUrl: string;
  username: string;
  tweetId: string;
  tweetText: string;
}

/** Flatten all unclassified media from a user's tweets into a single list. */
function collectUnclassifiedMedia(
  data: RawTweetsFile,
  classifiedImages: Map<string, unknown>,
): { url: string; tweetId: string; tweetText: string }[] {
  return data.tweets
    .filter((t) => t.media && t.media.length > 0 && !t.fullText.startsWith("RT @"))
    .flatMap((t) =>
      t
        .media!.filter((m) => !classifiedImages.has(m.url))
        .map((m) => ({ url: m.url, tweetId: t.id, tweetText: t.fullText })),
    );
}

export function analyzeInfo(twitter?: TwitterChannel): Task<void> {
  return task("analyze-info", function* () {
    // ── Load checkpoint and raw tweets ──────────────────────────────
    const { checkpoint, userFiles } = yield* work(async ($) => {
      $.description("Loading checkpoint and raw tweets…");

      const cp = await loadAnalyzeCheckpoint(CHECKPOINT_PATH);

      let files: string[];
      try {
        files = await readdir(RAW_TWEETS_DIR);
      } catch {
        files = [];
      }

      const jsonFiles = files.filter((f) => f.endsWith(".json")).toSorted();

      const userFiles: { username: string; data: RawTweetsFile }[] = [];
      for (const file of jsonFiles) {
        const raw = await readFile(join(RAW_TWEETS_DIR, file), "utf8");
        const data = JSON.parse(raw) as RawTweetsFile;
        const username = file.replace(/\.json$/, "");
        userFiles.push({ username, data });
      }

      return { checkpoint: cp, userFiles };
    });

    // ── Phase 1: Collect media targets ──────────────────────────────
    const collected: CollectedImage[] = [];

    for (const { username, data } of userFiles) {
      const media = collectUnclassifiedMedia(data, checkpoint.classified_images);

      for (const m of media) {
        collected.push({
          mediaUrl: m.url,
          username,
          tweetId: m.tweetId,
          tweetText: m.tweetText,
        });
      }
    }

    if (collected.length === 0) {
      yield* work(async ($) => {
        $.description("No new images to classify.");
      });
      return Ok(undefined);
    }
    // ── Phase 2: Invoke Restate and persist results ─────────────────
    const saved = yield* work(async ($) => {
      $.description(
        `Classifying ${collected.length} images with Restate (concurrency=${RESTATE_CONCURRENCY})…`,
      );
      $.progress({ kind: "count", value: 0 });

      let done = 0;
      let saved = 0;
      let nextIndex = 0;

      const runOne = async (img: CollectedImage): Promise<void> => {
        let classification: { confidence: number; reason: string };
        try {
          const response = await classifyMedia({
            mediaUrl: img.mediaUrl,
            tweetText: img.tweetText,
          });

          if (!response.ok) {
            classification = {
              confidence: 0,
              reason: `${response.error.code}: ${response.error.message}`,
            };
            if (response.error.code === "NOT_FOUND") {
              await refreshTweetFromSource(img.tweetId, img.username, twitter);
            }
            checkpoint.classified_images.set(img.mediaUrl, classification);
            return;
          }

          classification = {
            confidence: response.data.targets.booth_info?.confidence ?? 0,
            reason: response.data.reason,
          };
          checkpoint.classified_images.set(img.mediaUrl, classification);

          const mediaResponse = await fetch(img.mediaUrl);
          if (!mediaResponse.ok) {
            if (mediaResponse.status === 404) {
              await refreshTweetFromSource(img.tweetId, img.username, twitter);
            }
            return;
          }
          const mediaBytes = Buffer.from(await mediaResponse.arrayBuffer());
          const pngBuf = await sharp(mediaBytes).png().toBuffer();
          const sha256 = createHash("sha256").update(pngBuf).digest("hex");
          const metadata = await sharp(pngBuf).metadata();
          const paths = boothInfoPaths(sha256);
          const meta: BoothImageMeta = {
            url: img.mediaUrl,
            width: metadata.width!,
            height: metadata.height!,
            sha256,
            confidence: classification.confidence,
            reason: classification.reason,
          };
          await mkdir(paths.dir, { recursive: true });
          await Promise.all([
            writeFile(paths.png, pngBuf),
            writeFile(paths.meta, JSON.stringify(meta, undefined, 2), "utf8"),
          ]);
          saved++;
        } catch (error) {
          classification = {
            confidence: 0,
            reason: `Classification error: ${formatRestateError(error)}`,
          };
          checkpoint.classified_images.set(img.mediaUrl, classification);
        } finally {
          done++;
          $.progress({ kind: "count", value: done });
        }
      };

      const worker = async (): Promise<void> => {
        while (true) {
          const index = nextIndex++;
          if (index >= collected.length) return;
          const img = collected[index];
          if (img === undefined) return;
          await runOne(img);
        }
      };

      const workerCount = Math.min(RESTATE_CONCURRENCY, collected.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      return saved;
    });

    // Save checkpoint
    yield* work(async ($) => {
      $.description(`Done — ${saved} images saved.`);
      await saveAnalyzeCheckpoint(CHECKPOINT_PATH, checkpoint);
    });

    return Ok(undefined);
  });
}

function formatRestateError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function refreshTweetFromSource(
  tweetId: string,
  username: string,
  twitter?: TwitterChannel,
): Promise<void> {
  try {
    const tweetResponse = await readTweet({ tweetId });
    const loaded = await loadUserRawTweets(RAW_TWEETS_DIR, username);
    if (!tweetResponse.ok) {
      loaded.tweets.delete(tweetId);
    } else {
      const tweetDetail = tweetResponse.data;
      loaded.tweets.set(tweetId, {
        id: tweetDetail.id,
        fullText: tweetDetail.fullText,
        createdAt: tweetDetail.createdAt,
        conversationId: tweetDetail.conversationId,
        media: tweetDetail.mediaUrls.map((url) => ({ url })),
        urls: tweetDetail.urls,
      });
    }
    await saveUserRawTweets(RAW_TWEETS_DIR, username, loaded.tweets);
    return;
  } catch {
    if (!twitter) return;
  }

  if (!twitter) return;

  try {
    const tweetDetail = await twitter.enqueue((c) => c.tweet.details(tweetId));
    const loaded = await loadUserRawTweets(RAW_TWEETS_DIR, username);
    if (!tweetDetail) {
      loaded.tweets.delete(tweetId);
    } else {
      loaded.tweets.set(tweetId, {
        id: tweetDetail.id,
        fullText: tweetDetail.fullText,
        createdAt: tweetDetail.createdAt,
        conversationId: tweetDetail.conversationId,
        media: tweetDetail.media?.map((med) => ({ url: med.url })),
        urls: tweetDetail.entities.urls,
      });
    }
    await saveUserRawTweets(RAW_TWEETS_DIR, username, loaded.tweets);
  } catch {
    // Best effort only
  }
}
