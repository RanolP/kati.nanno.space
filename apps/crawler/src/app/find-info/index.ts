import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { AnyModel, Infer } from "../../features/model/index.ts";
import { deserialize } from "../../features/model/index.ts";
import { Ok, Skipped, pool, spawn, task, TaskContext, work } from "../../features/task/index.ts";
import type { Task } from "../../features/task/index.ts";
import { circleCollection, ongoingBoothInfoCollection } from "../models/illustar.ts";
import {
  goodsImageCollection,
  twitterLinkCollection,
  twitterMediaCollection,
  witchformProductCollection,
} from "../models/find-info.ts";
import { circleDetail } from "../../services/illustar/endpoints/circle/[id]/get.ts";
import {
  extractTwitterUrls,
  fetchThread,
  fetchSearchResults,
} from "../../services/twitter/index.ts";
import {
  extractWitchformUrls,
  fetchAndParseWitchform,
  isWitchformUrl,
} from "../../services/witchform/index.ts";
import type { FindInfoCheckpoint } from "./checkpoint.ts";
import { loadCheckpoint, saveCheckpoint } from "./checkpoint.ts";
import { persist } from "../persist.ts";
import { loadUserRawTweets, saveUserRawTweets } from "../raw-tweets-io.ts";

const CONCURRENCY = 16;

// Illustar circle applications open ~3 months before event start
const ILLUSTAR_ACTIVITY_LEAD_MS = 90 * 24 * 60 * 60 * 1000;

// Keywords for filtering tweets (unified — any match captures both media and links)
const KEYWORDS = ["일러스타", "일러페스", "일페", "인포", "안내", "선입금", "부스", "굿즈", "판매"];

interface DateRange {
  start: Date;
  end: Date;
}

interface CircleInfo {
  id: number;
  name: string;
  homepage: string;
  introduce: string;
  /** Event activity window: 3 months before start_date through end_date */
  window: DateRange;
}

const DATA_DIR = resolve(import.meta.dirname!, "../../../../../data");
const FIND_INFO_DIR = join(DATA_DIR, "find-info");
const CHECKPOINT_PATH = join(FIND_INFO_DIR, ".checkpoint.json");

function isInWindow(date: string | Date, window: DateRange): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return d >= window.start && d <= window.end;
}

function truncateText(text: string, maxLen = 280): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

async function loadCirclesFromDisk(): Promise<CircleInfo[]> {
  const illustarDir = join(DATA_DIR, "illustar");

  // Load ongoing booth info to get event IDs and date ranges
  const boothInfoContent = await readFile(join(illustarDir, "ongoing-booth-info.jsonl"), "utf8");
  const boothInfoFiles = new Map([["ongoing-booth-info.jsonl", boothInfoContent]]);
  const boothInfoMap = deserialize(
    ongoingBoothInfoCollection as AnyModel,
    { files: boothInfoFiles },
    "ongoing-booth-info",
  ) as Infer<typeof ongoingBoothInfoCollection>;

  // Build event ID → date window map
  const eventWindows = new Map<number, DateRange>();
  for (const event of boothInfoMap.values()) {
    if (event.start_date != undefined && event.end_date != undefined) {
      eventWindows.set(event.id, {
        start: new Date(event.start_date - ILLUSTAR_ACTIVITY_LEAD_MS),
        end: new Date(event.end_date),
      });
    }
  }

  // Load circles and filter to ongoing events with known date ranges
  const circlesContent = await readFile(join(illustarDir, "circles.jsonl"), "utf8");
  const circlesFiles = new Map([["circles.jsonl", circlesContent]]);
  const circlesMap = deserialize(
    circleCollection as AnyModel,
    { files: circlesFiles },
    "circles",
  ) as Infer<typeof circleCollection>;

  const circles: CircleInfo[] = [];
  for (const circle of circlesMap.values()) {
    const window = eventWindows.get(circle.event_id);
    if (window) {
      circles.push({
        id: circle.id,
        name: circle.booth_name,
        homepage: circle.homepage,
        introduce: circle.introduce,
        window,
      });
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

// --- Per-circle task: scan Twitter timeline with raw tweet persistence ---

const RAW_TWEETS_DIR = join(FIND_INFO_DIR, "raw-tweets");

// 3-day staleness threshold for skipping Twitter fetch
const RAW_TWEETS_FRESHNESS_MS = 3 * 24 * 60 * 60 * 1000;

function tweetMatchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function scanTwitterTask(
  circleId: number,
  username: string,
  window: DateRange,
  mediaResults: Infer<typeof twitterMediaCollection>,
  linkResults: Infer<typeof twitterLinkCollection>,
  checkpoint: FindInfoCheckpoint,
): Task<void> {
  return task(`scan-twitter-${circleId}`, function* () {
    const { twitterChannel } = yield* TaskContext();

    // Load cached raw tweets for this user
    const loaded = yield* work(async ($) => {
      $.description(`Loading raw tweets for @${username}`);
      return await loadUserRawTweets(RAW_TWEETS_DIR, username);
    });
    const rawTweets = loaded.tweets;

    // Skip fetch if raw tweets were fetched within the freshness window
    const isFresh =
      loaded.fetchedAt != undefined &&
      Date.now() - loaded.fetchedAt.getTime() < RAW_TWEETS_FRESHNESS_MS;

    // Fetch new tweets via search (excludes RTs server-side to reduce API calls)
    if (twitterChannel.hasAuth && !isFresh) {
      const scanState = checkpoint.twitter_scans.get(username);
      const stopBeforeId = scanState?.newest_seen_tweet_id;

      let newestTweetId = stopBeforeId;
      let unsavedCount = 0;

      yield* work(async ($) => {
        $.description(`Searching @${username} tweets`);

        await fetchSearchResults(
          twitterChannel,
          {
            fromUsers: [username],
            onlyOriginal: true,
            startDate: window.start,
            endDate: window.end,
          },
          {
            ...(stopBeforeId ? { stopBeforeTweetId: stopBeforeId } : {}),
            async onPage(pageTweets) {
              $.progress({ kind: "count", value: rawTweets.size });
              for (const tweet of pageTweets) {
                if (!newestTweetId || BigInt(tweet.id) > BigInt(newestTweetId)) {
                  newestTweetId = tweet.id;
                }
                rawTweets.set(tweet.id, {
                  id: tweet.id,
                  fullText: tweet.fullText,
                  createdAt: tweet.createdAt,
                  conversationId: tweet.conversationId,
                  media: tweet.media?.map((m) => ({ url: m.url })),
                  urls: tweet.entities.urls.filter((u): u is string => u != undefined),
                });
                unsavedCount++;
              }

              // Checkpoint every 100 tweets to allow resuming large fetches
              if (unsavedCount >= 100) {
                checkpoint.twitter_scans.set(username, {
                  newest_seen_tweet_id: newestTweetId!,
                });
                await saveUserRawTweets(RAW_TWEETS_DIR, username, rawTweets);
                await saveCheckpoint(CHECKPOINT_PATH, checkpoint);
                unsavedCount = 0;
              }
            },
          },
        );
      });

      if (newestTweetId) {
        checkpoint.twitter_scans.set(username, {
          newest_seen_tweet_id: newestTweetId,
        });
      }

      // Save raw tweets to disk
      yield* work(async ($) => {
        $.description(`Saving raw tweets for @${username}`);
        await saveUserRawTweets(RAW_TWEETS_DIR, username, rawTweets);
      });
    }

    // Process raw tweets: filter by window + keywords, collect media/links
    const threadConversationIds = new Set<string>();
    const collectedTweetIds = new Set<string>();

    for (const tweet of rawTweets.values()) {
      if (!isInWindow(tweet.createdAt, window)) continue;
      if (!tweetMatchesKeywords(tweet.fullText, KEYWORDS)) continue;

      const text = tweet.fullText;

      if (tweet.media) {
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
        collectedTweetIds.add(tweet.id);

        if (!checkpoint.threads_fetched.has(tweet.conversationId)) {
          threadConversationIds.add(tweet.conversationId);
        }
      }

      for (const url of tweet.urls.filter((u): u is string => u != undefined)) {
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

    // Fetch threads for media tweets
    if (twitterChannel.hasAuth && threadConversationIds.size > 0) {
      const threadTasks = [...threadConversationIds].map((convId) =>
        task(`fetch-thread-${convId}`, function* () {
          const threadTweets = yield* work(async ($) => {
            $.description(`Fetching thread ${convId}`);
            return await fetchThread(twitterChannel, convId, username);
          });

          for (const tweet of threadTweets) {
            if (collectedTweetIds.has(tweet.id)) continue;
            if (!tweet.media) continue;

            for (const media of tweet.media) {
              const key = [circleId, tweet.id, media.url].join("\0");
              mediaResults.set(key, {
                circle_id: circleId,
                tweet_id: tweet.id,
                image_url: media.url,
                twitter_username: username,
                tweet_text: truncateText(tweet.fullText),
                tweeted_at: tweet.createdAt,
              });
            }
          }

          checkpoint.threads_fetched.add(convId);
          // eslint-disable-next-line unicorn/no-useless-undefined
          return Ok(undefined);
        }),
      );
      yield* pool(threadTasks, CONCURRENCY, { description: "Fetching threads" });
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

    for (let i = 0; i < pendingUrls.length; i++) {
      const url = pendingUrls[i]!;
      const formData = yield* work(async ($) => {
        $.description(`Parsing Witchform (${i + 1}/${pendingUrls.length}): ${url}`);
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
  return task(`circle-${circle.id} ${circle.name}`, function* () {
    const subTasks: Task<unknown>[] = [];

    // Illustar goods list
    subTasks.push(fetchGoodsListTask(circle.id, goodsImages, checkpoint));

    // Twitter timeline scan
    const [firstTwitter] = extractTwitterUrls(circle.homepage);
    if (firstTwitter) {
      subTasks.push(
        scanTwitterTask(
          circle.id,
          firstTwitter.username,
          circle.window,
          twitterMedia,
          twitterLinks,
          checkpoint,
        ),
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
    yield* pool(circleTasks, CONCURRENCY, { description: "Processing circles" });

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
