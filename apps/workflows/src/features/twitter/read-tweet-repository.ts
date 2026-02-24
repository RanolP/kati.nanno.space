import * as v from "valibot";

import { readTweetDataSchema } from "@/app/crawler/read-tweet/schema.ts";
import type { ReadTweetData } from "@/app/crawler/read-tweet/schema.ts";
import { getDb, sql } from "@/shared/db/kysely.ts";

const READ_TWEET_SCHEMA_VERSION = 1;
let initialized = false;

async function ensureSchema(): Promise<void> {
  if (initialized) return;

  const db = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS twitter_read_tweet_cache (
      key TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    ALTER TABLE twitter_read_tweet_cache
    ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1
  `.execute(db);

  await sql`
    ALTER TABLE twitter_read_tweet_cache
    ADD COLUMN IF NOT EXISTS data JSONB
  `.execute(db);

  await sql`
    ALTER TABLE twitter_read_tweet_cache
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `.execute(db);

  initialized = true;
}

export async function loadReadTweetData(tweetId: string): Promise<ReadTweetData | null> {
  await ensureSchema();
  const db = getDb();

  const row = await db
    .selectFrom("twitter_read_tweet_cache")
    .select(["data"])
    .where("key", "=", tweetId)
    .executeTakeFirst();

  if (row === undefined) return null;

  const parsed = v.safeParse(readTweetDataSchema, row.data);
  if (!parsed.success) {
    throw new Error(`Invalid persisted tweet payload for key: ${tweetId}`);
  }

  return parsed.output;
}

export async function saveReadTweetData(tweetId: string, data: ReadTweetData): Promise<void> {
  await ensureSchema();
  const db = getDb();

  await db
    .insertInto("twitter_read_tweet_cache")
    .values({
      key: tweetId,
      schema_version: READ_TWEET_SCHEMA_VERSION,
      data,
      updated_at: new Date(),
    })
    .onConflict((oc) =>
      oc.column("key").doUpdateSet({
        schema_version: READ_TWEET_SCHEMA_VERSION,
        data,
        updated_at: new Date(),
      }),
    )
    .execute();
}
