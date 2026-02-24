import type { OngoingBoothInfoItem } from "@/app/illustar-crawler/get-ongoing-booth-info/schema.ts";
import { getDb, sql } from "@/shared/db/kysely.ts";
import type { AppDatabase } from "@/shared/db/kysely.ts";
import type { Transaction } from "kysely";

const ONGOING_BOOTH_INFO_SCHEMA_VERSION = 1;
let initialized = false;

async function ensureSchema(): Promise<void> {
  if (initialized) return;

  const db = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS illustar_ongoing_booth_info (
      key TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    ALTER TABLE illustar_ongoing_booth_info
    ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1
  `.execute(db);

  await sql`
    ALTER TABLE illustar_ongoing_booth_info
    ADD COLUMN IF NOT EXISTS key TEXT
  `.execute(db);

  await sql`
    ALTER TABLE illustar_ongoing_booth_info
    ADD COLUMN IF NOT EXISTS data JSONB
  `.execute(db);

  await sql`
    ALTER TABLE illustar_ongoing_booth_info
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_illustar_ongoing_booth_info_key_updated
    ON illustar_ongoing_booth_info (key, updated_at DESC)
  `.execute(db);

  initialized = true;
}

export async function saveOngoingBoothInfoItems(items: OngoingBoothInfoItem[]): Promise<void> {
  if (items.length === 0) return;

  await ensureSchema();
  const db = getDb();

  await db.transaction().execute(async (trx: Transaction<AppDatabase>) => {
    for (const item of items) {
      await trx
        .insertInto("illustar_ongoing_booth_info")
        .values({
          key: String(item.id),
          schema_version: ONGOING_BOOTH_INFO_SCHEMA_VERSION,
          data: item,
          updated_at: new Date(),
        })
        .execute();
    }
  });
}

export async function loadOngoingBoothInfoJsonl(): Promise<string> {
  await ensureSchema();
  const db = getDb();

  const startDateOrderExpr = sql<number | null>`
    CASE
      WHEN schema_version = 1
        AND data ? 'startDate'
        AND (data->>'startDate') ~ '^[0-9]+$'
        THEN (data->>'startDate')::BIGINT
      WHEN schema_version = 2
        AND data ? 'start_date'
        AND (data->>'start_date') ~ '^[0-9]+$'
        THEN (data->>'start_date')::BIGINT
      ELSE NULL
    END
  `;

  const rows = await db
    .selectFrom("illustar_ongoing_booth_info")
    .select(["key", "schema_version", "data"])
    .orderBy(sql`${startDateOrderExpr} DESC NULLS LAST`)
    .orderBy("key", "desc")
    .execute();

  return rows
    .map((row: { key: string; schema_version: number; data: unknown }) =>
      JSON.stringify({
        key: row.key,
        schema_version: row.schema_version,
        data: row.data,
      }),
    )
    .join("\n");
}
