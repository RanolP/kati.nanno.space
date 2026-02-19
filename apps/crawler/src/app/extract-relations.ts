import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Ok, task, work } from "../features/task/index.ts";
import type { Task } from "../features/task/index.ts";

interface TwitterLinkRecord {
  circle_id: number;
  tweet_id: string;
  link_url: string;
}

interface WitchformProductRecord {
  circle_id: number;
  witchform_url: string;
}

interface BoothRelation {
  witchform_id: string;
  witchform_urls: string[];
  tweet_ids: string[];
}

interface CircleRelation {
  illustar_circle_id: number;
  booth_infos: BoothRelation[];
}

const DATA_DIR = resolve(import.meta.dirname!, "../../../../data/find-info");
const TWITTER_LINKS_PATH = join(DATA_DIR, "twitter-links.jsonl");
const WITCHFORM_PRODUCTS_PATH = join(DATA_DIR, "witchform-products.jsonl");
const OUTPUT_PATH = join(DATA_DIR, "circle-booth-relations.json");

function parseJsonl<T>(content: string): T[] {
  if (!content.trim()) return [];
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function parseWitchformId(urlRaw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    return undefined;
  }

  if (url.hostname !== "witchform.com" && url.hostname !== "www.witchform.com") {
    return undefined;
  }

  if (url.pathname === "/deposit_form.php") {
    const idx = url.searchParams.get("idx");
    return idx ? `deposit:${idx}` : undefined;
  }

  if (url.pathname === "/payform/" || url.pathname === "/payform") {
    const uuid = url.searchParams.get("uuid");
    return uuid ? `payform:${uuid}` : undefined;
  }

  if (url.pathname.startsWith("/payform/")) {
    const slug = url.pathname.slice("/payform/".length).replace(/\/$/, "");
    return slug ? `payform:${slug}` : undefined;
  }

  return undefined;
}

export function extractRelations(): Task<void> {
  return task("extract-relations", function* () {
    const twitterLinks = yield* work(async ($) => {
      $.description("Loading twitter-links.jsonl");
      const content = await readFile(TWITTER_LINKS_PATH, "utf8");
      return parseJsonl<TwitterLinkRecord>(content);
    });

    const witchformProducts = yield* work(async ($) => {
      $.description("Loading witchform-products.jsonl");
      const content = await readFile(WITCHFORM_PRODUCTS_PATH, "utf8");
      return parseJsonl<WitchformProductRecord>(content);
    });

    const relationMap = new Map<
      string,
      { circle_id: number; witchform_id: string; urls: Set<string>; tweet_ids: Set<string> }
    >();

    for (const product of witchformProducts) {
      const witchformId = parseWitchformId(product.witchform_url);
      if (!witchformId) continue;

      const key = `${product.circle_id}\0${witchformId}`;
      const relation = relationMap.get(key);
      if (relation) {
        relation.urls.add(product.witchform_url);
      } else {
        relationMap.set(key, {
          circle_id: product.circle_id,
          witchform_id: witchformId,
          urls: new Set([product.witchform_url]),
          tweet_ids: new Set(),
        });
      }
    }

    for (const link of twitterLinks) {
      const witchformId = parseWitchformId(link.link_url);
      if (!witchformId) continue;

      const key = `${link.circle_id}\0${witchformId}`;
      const relation = relationMap.get(key);
      if (!relation) continue;
      relation.urls.add(link.link_url);
      relation.tweet_ids.add(link.tweet_id);
    }

    const grouped = new Map<number, BoothRelation[]>();
    for (const relation of relationMap.values()) {
      const boothInfo: BoothRelation = {
        witchform_id: relation.witchform_id,
        witchform_urls: [...relation.urls].toSorted(),
        tweet_ids: [...relation.tweet_ids].toSorted(),
      };

      const list = grouped.get(relation.circle_id);
      if (list) {
        list.push(boothInfo);
      } else {
        grouped.set(relation.circle_id, [boothInfo]);
      }
    }

    const relations: CircleRelation[] = [...grouped.entries()]
      .toSorted((a, b) => a[0] - b[0])
      .map(([circleId, boothInfos]) => ({
        illustar_circle_id: circleId,
        booth_infos: boothInfos.toSorted((a, b) => a.witchform_id.localeCompare(b.witchform_id)),
      }));

    const output = {
      generated_at: new Date().toISOString(),
      relation_count: relations.reduce((sum, r) => sum + r.booth_infos.length, 0),
      circles: relations,
    };

    yield* work(async ($) => {
      $.description("Writing circle-booth-relations.json");
      await writeFile(OUTPUT_PATH, `${JSON.stringify(output, undefined, 2)}\n`, "utf8");
    });

    // eslint-disable-next-line unicorn/no-useless-undefined
    return Ok(undefined);
  });
}
