import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { AnyModel, Infer } from "../features/model/index.ts";
import { deserialize } from "../features/model/index.ts";
import { Ok, Skipped, pool, spawn, task, TaskContext, work } from "../features/task/index.ts";
import type { Task } from "../features/task/index.ts";
import { circleCollection, ongoingBoothInfoCollection } from "./models/illustar.ts";
import {
  goodsImageCollection,
  twitterLinkCollection,
  twitterMediaCollection,
  witchformProductCollection,
} from "./models/find-info.ts";
import { circleDetail } from "../services/illustar/endpoints/circle/[id]/get.ts";
import { extractTwitterUrls, fetchUserTimeline } from "../services/twitter/index.ts";
import {
  extractWitchformUrls,
  fetchAndParseWitchform,
  isWitchformUrl,
} from "../services/witchform/index.ts";
import type { FindInfoCheckpoint } from "./find-info-checkpoint.ts";
import { loadCheckpoint, saveCheckpoint } from "./find-info-checkpoint.ts";
import { persist } from "./persist.ts";

const CONCURRENCY = 8;

// Keywords for filtering tweets
const MEDIA_KEYWORDS = ["일러스타", "일러페스", "일페"];
const LINK_KEYWORDS = ["선입금"];

interface CircleInfo {
  id: number;
  homepage: string;
  introduce: string;
}

const DATA_DIR = resolve(import.meta.dirname!, "../../../../data");
const FIND_INFO_DIR = join(DATA_DIR, "find-info");
const CHECKPOINT_PATH = join(FIND_INFO_DIR, ".checkpoint.json");

function tweetMatchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function truncateText(text: string, maxLen = 280): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

async function loadCirclesFromDisk(): Promise<CircleInfo[]> {
  const illustarDir = join(DATA_DIR, "illustar");

  // Load ongoing booth info to get event IDs
  const boothInfoContent = await readFile(join(illustarDir, "ongoing-booth-info.jsonl"), "utf8");
  const boothInfoFiles = new Map([["ongoing-booth-info.jsonl", boothInfoContent]]);
  const boothInfoMap = deserialize(
    ongoingBoothInfoCollection as AnyModel,
    { files: boothInfoFiles },
    "ongoing-booth-info",
  ) as Infer<typeof ongoingBoothInfoCollection>;
  const ongoingEventIds = new Set([...boothInfoMap.values()].map((b) => b.id));

  // Load circles and filter to ongoing events
  const circlesContent = await readFile(join(illustarDir, "circles.jsonl"), "utf8");
  const circlesFiles = new Map([["circles.jsonl", circlesContent]]);
  const circlesMap = deserialize(
    circleCollection as AnyModel,
    { files: circlesFiles },
    "circles",
  ) as Infer<typeof circleCollection>;

  const circles: CircleInfo[] = [];
  for (const circle of circlesMap.values()) {
    if (ongoingEventIds.has(circle.event_id)) {
      circles.push({ id: circle.id, homepage: circle.homepage, introduce: circle.introduce });
    }
  }

  return circles;
}

// --- Per-circle task: fetch goods_list images ---

function fetchGoodsListTask(
  circleId: number,
  results: Infer<typeof goodsImageCollection>,
  checkpoint: FindInfoCheckpoint,
): Task<void> {
  return task(`fetch-goods-${circleId}`, function* () {
    if (checkpoint.illustar_fetched.has(circleId)) {
      return Skipped;
    }

    const { fetcher } = yield* TaskContext();

    const detail = yield* work(async ($) => {
      $.description(`Fetching circle ${circleId} detail`);
      return await fetcher.fetch(circleDetail, { path: { id: circleId } });
    });

    for (const img of detail.userBoothApplication.goods_list) {
      const key = [circleId, img.id].join("\0");
      results.set(key, {
        circle_id: circleId,
        image_id: img.id,
        image_url: img.url,
        original_name: img.original_name,
      });
    }

    checkpoint.illustar_fetched.add(circleId);
    // eslint-disable-next-line unicorn/no-useless-undefined
    return Ok(undefined);
  });
}

// --- Per-circle task: scan Twitter timeline ---

function scanTwitterTask(
  circleId: number,
  username: string,
  mediaResults: Infer<typeof twitterMediaCollection>,
  linkResults: Infer<typeof twitterLinkCollection>,
  checkpoint: FindInfoCheckpoint,
): Task<void> {
  return task(`scan-twitter-${circleId}`, function* () {
    const { twitterChannel } = yield* TaskContext();

    const scanState = checkpoint.twitter_scans.get(username);
    const stopBeforeId = scanState?.newest_seen_tweet_id;

    const tweets = yield* work(async ($) => {
      $.description(`Scanning @${username} timeline`);

      const user = await twitterChannel.enqueue((client) => client.user.details(username));
      if (!user) return [];
      return await fetchUserTimeline(twitterChannel, user.id, stopBeforeId);
    });

    let newestTweetId = stopBeforeId;

    for (const tweet of tweets) {
      // Track newest tweet ID
      if (!newestTweetId || BigInt(tweet.id) > BigInt(newestTweetId)) {
        newestTweetId = tweet.id;
      }

      const text = tweet.fullText;

      // Collect media from tweets matching media keywords
      if (tweetMatchesKeywords(text, MEDIA_KEYWORDS) && tweet.media) {
        for (const media of tweet.media) {
          const key = [circleId, tweet.id, media.url].join("\0");
          mediaResults.set(key, {
            circle_id: circleId,
            tweet_id: tweet.id,
            image_url: media.url,
            twitter_username: username,
            tweet_text: truncateText(text),
            tweeted_at: tweet.createdAt,
          });
        }
      }

      // Collect links from tweets matching link keywords
      if (tweetMatchesKeywords(text, LINK_KEYWORDS)) {
        for (const url of tweet.entities.urls) {
          const key = [circleId, tweet.id, url].join("\0");
          linkResults.set(key, {
            circle_id: circleId,
            tweet_id: tweet.id,
            link_url: url,
            twitter_username: username,
            tweet_text: truncateText(text),
            tweeted_at: tweet.createdAt,
          });
        }
      }
    }

    // Update checkpoint
    if (newestTweetId) {
      checkpoint.twitter_scans.set(username, {
        newest_seen_tweet_id: newestTweetId,
        scan_completed_at: new Date().toISOString(),
      });
    }

    // eslint-disable-next-line unicorn/no-useless-undefined
    return Ok(undefined);
  });
}

// --- Per-circle task: parse Witchform pages ---

function parseWitchformTask(
  circleId: number,
  urls: string[],
  results: Infer<typeof witchformProductCollection>,
  checkpoint: FindInfoCheckpoint,
): Task<void> {
  return task(`parse-witchform-${circleId}`, function* () {
    const pendingUrls = urls.filter((url) => !checkpoint.witchform_fetched.has(url));
    if (pendingUrls.length === 0) {
      return Skipped;
    }

    for (const url of pendingUrls) {
      const formData = yield* work(async ($) => {
        $.description(`Parsing Witchform: ${url}`);
        return await fetchAndParseWitchform(url);
      });

      for (const product of formData.products) {
        const key = [circleId, url, product.index].join("\0");
        results.set(key, {
          circle_id: circleId,
          witchform_url: url,
          form_title: formData.title,
          product_index: product.index,
          product_name: product.name,
          price: product.price,
          image_url: product.imageUrl,
        });
      }

      checkpoint.witchform_fetched.add(url);
    }

    // eslint-disable-next-line unicorn/no-useless-undefined
    return Ok(undefined);
  });
}

// --- Per-circle compound task ---

function processCircle(
  circle: CircleInfo,
  goodsImages: Infer<typeof goodsImageCollection>,
  twitterMedia: Infer<typeof twitterMediaCollection>,
  twitterLinks: Infer<typeof twitterLinkCollection>,
  witchformProducts: Infer<typeof witchformProductCollection>,
  checkpoint: FindInfoCheckpoint,
): Task<void> {
  return task(`circle-${circle.id}`, function* () {
    const subTasks: Task<unknown>[] = [];

    // Illustar goods list
    subTasks.push(fetchGoodsListTask(circle.id, goodsImages, checkpoint));

    // Twitter scan
    const [firstTwitter] = extractTwitterUrls(circle.homepage);
    if (firstTwitter) {
      subTasks.push(
        scanTwitterTask(circle.id, firstTwitter.username, twitterMedia, twitterLinks, checkpoint),
      );
    }

    // Witchform from homepage/introduce
    const witchformUrls = [
      ...new Set([
        ...extractWitchformUrls(circle.homepage),
        ...extractWitchformUrls(circle.introduce),
      ]),
    ];
    if (witchformUrls.length > 0) {
      subTasks.push(parseWitchformTask(circle.id, witchformUrls, witchformProducts, checkpoint));
    }

    yield* spawn(subTasks);

    // After Twitter scan: discover + parse Witchform URLs from Twitter links
    const existingUrls = new Set(witchformUrls);
    const discoveredUrls: string[] = [];
    for (const link of twitterLinks.values()) {
      if (
        link.circle_id === circle.id &&
        isWitchformUrl(link.link_url) &&
        !existingUrls.has(link.link_url)
      ) {
        discoveredUrls.push(link.link_url);
      }
    }
    if (discoveredUrls.length > 0) {
      yield* spawn([parseWitchformTask(circle.id, discoveredUrls, witchformProducts, checkpoint)]);
    }

    // Save checkpoint after this circle
    yield* work(async ($) => {
      $.description("Saving checkpoint");
      await saveCheckpoint(CHECKPOINT_PATH, checkpoint);
    });

    // eslint-disable-next-line unicorn/no-useless-undefined
    return Ok(undefined);
  });
}

// --- Main orchestrator ---

export function findInfo(): Task<void> {
  return task("find-info", function* () {
    const circles = yield* work(async ($) => {
      $.description("Loading circles from disk");
      return await loadCirclesFromDisk();
    });

    const checkpoint = yield* work(async ($) => {
      $.description("Loading checkpoint");
      return await loadCheckpoint(CHECKPOINT_PATH);
    });

    // Shared result accumulators
    const goodsImages: Infer<typeof goodsImageCollection> = new Map();
    const twitterMedia: Infer<typeof twitterMediaCollection> = new Map();
    const twitterLinks: Infer<typeof twitterLinkCollection> = new Map();
    const witchformProducts: Infer<typeof witchformProductCollection> = new Map();

    // Process all circles with concurrency pool
    const circleTasks = circles.map((circle) =>
      processCircle(circle, goodsImages, twitterMedia, twitterLinks, witchformProducts, checkpoint),
    );
    yield* pool(circleTasks, CONCURRENCY);

    // Persist all collections
    yield* work(async ($) => {
      $.description("Persisting goods images");
      await persist(goodsImageCollection, goodsImages, "goods-images", FIND_INFO_DIR);
    });
    yield* work(async ($) => {
      $.description("Persisting Twitter media");
      await persist(twitterMediaCollection, twitterMedia, "twitter-media", FIND_INFO_DIR);
    });
    yield* work(async ($) => {
      $.description("Persisting Twitter links");
      await persist(twitterLinkCollection, twitterLinks, "twitter-links", FIND_INFO_DIR);
    });
    yield* work(async ($) => {
      $.description("Persisting Witchform products");
      await persist(
        witchformProductCollection,
        witchformProducts,
        "witchform-products",
        FIND_INFO_DIR,
      );
    });

    // Final checkpoint save
    yield* work(async ($) => {
      $.description("Saving final checkpoint");
      await saveCheckpoint(CHECKPOINT_PATH, checkpoint);
    });

    // eslint-disable-next-line unicorn/no-useless-undefined
    return Ok(undefined);
  });
}
