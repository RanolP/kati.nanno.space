import { Rettiwt } from "rettiwt-api";
import type { CursoredData, Tweet } from "rettiwt-api";

declare module "../../features/task/types.ts" {
  interface TaskContext {
    readonly twitterChannel: TwitterChannel;
  }
}

interface QueueItem {
  execute: (client: Rettiwt) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export class TwitterChannel {
  private readonly queue: QueueItem[] = [];
  private processing = false;
  private readonly delayMs: number;
  private readonly client: Rettiwt;

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 2000;
    this.client = new Rettiwt();
  }

  enqueue<T>(execute: (client: Rettiwt) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: execute as (client: Rettiwt) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await item.execute(this.client);
        item.resolve(result);
      } catch (error: unknown) {
        if (isRateLimitError(error)) {
          // Push back and wait
          this.queue.unshift(item);
          console.warn("[TwitterChannel] Rate limited, waiting 60s…");
          await sleep(60_000);
        } else {
          item.reject(error);
        }
      }
      // Delay between requests
      if (this.queue.length > 0) {
        await sleep(this.delayMs);
      }
    }

    this.processing = false;
  }
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("429") || msg.includes("rate limit");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Twitter snowflake IDs are numeric strings — compare as BigInt for correct ordering
function tweetIdLte(a: string, b: string): boolean {
  return BigInt(a) <= BigInt(b);
}

/** Fetch user timeline pages, stopping at `stopBeforeTweetId` (exclusive). */
export async function fetchUserTimeline(
  channel: TwitterChannel,
  userId: string,
  stopBeforeTweetId?: string,
  maxPages = 5,
): Promise<Tweet[]> {
  const allTweets: Tweet[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    let data: CursoredData<Tweet>;
    try {
      data = await channel.enqueue((client) => client.user.timeline(userId, 20, cursor));
    } catch (error) {
      console.warn(`[TwitterChannel] Failed to fetch timeline for ${userId}:`, error);
      break;
    }

    if (data.list.length === 0) break;

    let hitCheckpoint = false;
    for (const tweet of data.list) {
      if (stopBeforeTweetId && tweetIdLte(tweet.id, stopBeforeTweetId)) {
        hitCheckpoint = true;
        break;
      }
      allTweets.push(tweet);
    }

    if (hitCheckpoint) break;
    if (!data.next) break;
    cursor = data.next;
  }

  return allTweets;
}
