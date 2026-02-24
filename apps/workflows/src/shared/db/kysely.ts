import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import { WorkflowEnv } from "@/shared/env.ts";

export interface AppDatabase {
  illustar_ongoing_booth_info: {
    key: string;
    schema_version: number;
    data: unknown;
    updated_at: Date;
  };
  twitter_read_tweet_cache: {
    key: string;
    schema_version: number;
    data: unknown;
    updated_at: Date;
  };
}

let cachedDb: Kysely<AppDatabase> | null = null;

export function getDb(): Kysely<AppDatabase> {
  if (cachedDb !== null) return cachedDb;

  const pool = new Pool({
    connectionString: WorkflowEnv.PG_URL,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });

  cachedDb = new Kysely<AppDatabase>({
    dialect: new PostgresDialect({ pool }),
  });

  return cachedDb;
}

export { sql };
