import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import sharp from "sharp";

import { Ok, task, work } from "../../features/task/index.ts";
import type { Task } from "../../features/task/index.ts";
import { classifyImage, formatGeminiError } from "../../services/gemini/batch.ts";
import type { ClassificationRequest } from "../../services/gemini/batch.ts";
import { boothInfoPaths } from "../review-info/shared.ts";
import type { BoothImageMeta } from "../review-info/shared.ts";
import { loadAnalyzeCheckpoint, saveAnalyzeCheckpoint } from "./checkpoint.ts";
import { loadUserRawTweets, saveUserRawTweets } from "../raw-tweets-io.ts";
import type { RawTweetsFile } from "../raw-tweets-io.ts";
import type { TwitterChannel } from "../../services/twitter/index.ts";

const DATA_DIR = resolve(import.meta.dirname!, "../../../../../data");
const FIND_INFO_DIR = join(DATA_DIR, "find-info");
const RAW_TWEETS_DIR = join(FIND_INFO_DIR, "raw-tweets");
const IMAGE_CACHE_DIR = join(FIND_INFO_DIR, ".image-cache");
const CHECKPOINT_PATH = join(FIND_INFO_DIR, ".analyze-checkpoint.json");

const GEMINI_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.CRAWLER_GEMINI_CONCURRENCY ?? "8", 10) || 8,
);
const GEMINI_RPM = Math.max(1, Number.parseInt(process.env.CRAWLER_GEMINI_RPM ?? "60", 10) || 60);

/** Pending image waiting for batch classification. */
interface CollectedImage {
  mediaUrl: string;
  username: string;
  tweetId: string;
  tweetText: string;
  cacheKey: string;
}

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function createRpmGate(rpm: number): () => Promise<void> {
  const intervalMs = Math.ceil(60_000 / rpm);
  let nextAllowedAt = 0;
  let gate = Promise.resolve();

  return async () => {
    gate = gate.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, nextAllowedAt - now);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      nextAllowedAt = Math.max(nextAllowedAt, Date.now()) + intervalMs;
    });
    await gate;
  };
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
        .media!.filter((m) => !classifiedImages.has(m.url) && !m.url.includes("video.twimg.com"))
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

    // ── Phase 1: Collect & download in parallel ────────────────────
    const collected: CollectedImage[] = [];

    // Gather all media that need downloading
    interface DownloadTarget {
      url: string;
      username: string;
      tweetId: string;
      tweetText: string;
      cacheKey: string;
      cachePath: string;
    }

    const targets: DownloadTarget[] = [];

    for (const { username, data } of userFiles) {
      const media = collectUnclassifiedMedia(data, checkpoint.classified_images);

      for (const m of media) {
        const cacheKey = urlHash(m.url);
        targets.push({
          url: m.url,
          username,
          tweetId: m.tweetId,
          tweetText: m.tweetText,
          cacheKey,
          cachePath: join(IMAGE_CACHE_DIR, `${cacheKey}.png`),
        });
      }
    }

    if (targets.length === 0) {
      yield* work(async ($) => {
        $.description("No new images to classify.");
      });
      return Ok(undefined);
    }

    // Download all uncached images in parallel
    const results = yield* work(async ($) => {
      await mkdir(IMAGE_CACHE_DIR, { recursive: true });
      $.description(`Downloading ${targets.length} images…`);

      const downloadOne = async (t: DownloadTarget): Promise<boolean> => {
        if (await fileExists(t.cachePath)) return true;

        const resp = await fetch(t.url);

        if (resp.status === 404 && twitter) {
          try {
            const tweetDetail = await twitter.enqueue((c) => c.tweet.details(t.tweetId));
            const loaded = await loadUserRawTweets(RAW_TWEETS_DIR, t.username);
            if (!tweetDetail) {
              loaded.tweets.delete(t.tweetId);
            } else {
              loaded.tweets.set(t.tweetId, {
                id: tweetDetail.id,
                fullText: tweetDetail.fullText,
                createdAt: tweetDetail.createdAt,
                conversationId: tweetDetail.conversationId,
                media: tweetDetail.media?.map((med) => ({ url: med.url })),
                urls: tweetDetail.entities.urls,
              });
            }
            await saveUserRawTweets(RAW_TWEETS_DIR, t.username, loaded.tweets);
          } catch {
            // Tweet detail fetch failed (deleted, suspended, etc.) — skip
          }
          return false;
        }

        if (!resp.ok) return false;

        const arrayBuf = await resp.arrayBuffer();
        try {
          const pngBuf = await sharp(Buffer.from(arrayBuf)).png().toBuffer();
          await writeFile(t.cachePath, pngBuf);
        } catch {
          return false;
        }
        return true;
      };

      return Promise.allSettled(targets.map((t) => downloadOne(t)));
    });

    for (let i = 0; i < targets.length; i++) {
      const result = results[i]!;
      if (result.status !== "fulfilled" || !result.value) continue;
      const t = targets[i]!;
      collected.push({
        mediaUrl: t.url,
        username: t.username,
        tweetId: t.tweetId,
        tweetText: t.tweetText,
        cacheKey: t.cacheKey,
      });
    }

    if (collected.length === 0) {
      yield* work(async ($) => {
        $.description("No images downloaded successfully.");
      });
      return Ok(undefined);
    }

    // ── Phase 2: Parallel direct requests with RPM gate ─────────────
    const saved = yield* work(async ($) => {
      $.description(
        `Classifying ${collected.length} images (parallel=${GEMINI_CONCURRENCY}, rpm<=${GEMINI_RPM})…`,
      );
      $.progress({ kind: "count", value: 0 });

      let nextIndex = 0;
      let done = 0;
      let saved = 0;
      const rpmGate = createRpmGate(GEMINI_RPM);

      const worker = async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= collected.length) return;

          const img = collected[index]!;
          const cachePath = join(IMAGE_CACHE_DIR, `${img.cacheKey}.png`);

          let classification: { confidence: number; reason: string };
          try {
            const pngBuf = await readFile(cachePath);
            await rpmGate();
            const req: ClassificationRequest = {
              key: img.mediaUrl,
              pngBase64: pngBuf.toString("base64"),
              tweetText: img.tweetText,
            };
            classification = await classifyImage(req);

            checkpoint.classified_images.set(img.mediaUrl, classification);

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
              reason: `Classification error: ${formatGeminiError(error)}`,
            };
            checkpoint.classified_images.set(img.mediaUrl, classification);
          } finally {
            done++;
            $.progress({ kind: "count", value: done });
          }
        }
      };

      const workerCount = Math.min(GEMINI_CONCURRENCY, collected.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      return saved;
    });

    // Save checkpoint and clean cache
    yield* work(async ($) => {
      $.description(`Done — ${saved} images saved. Cleaning up cache…`);
      try {
        await rm(IMAGE_CACHE_DIR, { recursive: true });
      } catch {
        // Ignore if already cleaned
      }
      await saveAnalyzeCheckpoint(CHECKPOINT_PATH, checkpoint);
    });

    return Ok(undefined);
  });
}
