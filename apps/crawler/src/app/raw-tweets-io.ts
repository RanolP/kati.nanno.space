import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface RawTweet {
  id: string;
  fullText: string;
  createdAt: string;
  conversationId: string;
  media: { url: string }[] | undefined;
  urls: string[];
}

export interface RawTweetsFile {
  fetchedAt: string;
  tweets: RawTweet[];
}

export interface LoadedRawTweets {
  fetchedAt: Date | undefined;
  tweets: Map<string, RawTweet>;
}

export async function loadUserRawTweets(dir: string, username: string): Promise<LoadedRawTweets> {
  let raw: string;
  try {
    raw = await readFile(join(dir, `${username}.json`), "utf8");
  } catch {
    return { fetchedAt: undefined, tweets: new Map() };
  }
  const parsed = JSON.parse(raw) as RawTweetsFile | RawTweet[];
  // Migrate legacy format (plain array)
  if (Array.isArray(parsed)) {
    return { fetchedAt: undefined, tweets: new Map(parsed.map((t) => [t.id, t])) };
  }
  return {
    fetchedAt: new Date(parsed.fetchedAt),
    tweets: new Map(parsed.tweets.map((t) => [t.id, t])),
  };
}

export async function saveUserRawTweets(
  dir: string,
  username: string,
  tweets: Map<string, RawTweet>,
): Promise<void> {
  const file: RawTweetsFile = {
    fetchedAt: new Date().toISOString(),
    tweets: [...tweets.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
  };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${username}.json`), `${JSON.stringify(file, undefined, 2)}\n`, "utf8");
}
