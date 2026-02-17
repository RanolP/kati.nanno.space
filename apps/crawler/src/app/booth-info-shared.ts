import { execFile as execFileCb } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

import { normalizeVariantImages } from "./booth-info-types.ts";
import type { BoothProduct, ProductVariant } from "./booth-info-types.ts";

const execFile = promisify(execFileCb);

export const BOOTH_INFO_DATA_DIR = resolve(
  import.meta.dirname!,
  "../../../../data/booth-info-analysis",
);
export const REVIEW_MIN_CONFIDENCE = 0.9;

export interface BoothImageMeta {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly confidence: number;
  readonly reason: string;
}

export function boothInfoPaths(hash: string) {
  const dir = resolve(BOOTH_INFO_DATA_DIR, hash.slice(0, 4));
  return {
    dir,
    png: resolve(dir, `${hash}.png`),
    meta: resolve(dir, `${hash}.meta.json`),
    jsonl: resolve(dir, `${hash}.jsonl`),
  };
}

export async function readBoothImageMeta(hash: string): Promise<BoothImageMeta | undefined> {
  const paths = boothInfoPaths(hash);
  try {
    return JSON.parse(await readFile(paths.meta, "utf8")) as BoothImageMeta;
  } catch {
    return undefined;
  }
}

export async function isReviewEligible(hash: string): Promise<boolean> {
  const meta = await readBoothImageMeta(hash);
  return meta != undefined && meta.confidence >= REVIEW_MIN_CONFIDENCE;
}

/** Old variant shape without status field, used for migration. */
interface LegacyVariant {
  readonly name: string;
  readonly images: readonly ProductVariant["images"][number][];
}

/** Read products from JSONL, migrating old data that lacks variant.status. */
export async function readProducts(filePath: string): Promise<BoothProduct[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const raw = JSON.parse(line) as BoothProduct;
      // Migrate old JSONL without variant-level status
      const variants: ProductVariant[] = raw.variants.map((v) => {
        const legacy = v as unknown as LegacyVariant;
        if ("status" in v) {
          return { ...v, images: normalizeVariantImages(v.images) };
        }
        return {
          name: legacy.name,
          images: normalizeVariantImages(legacy.images),
          status: "pending" as const,
        };
      });
      return { ...raw, variants } as BoothProduct;
    });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Extract hashes from git dirty files in data/booth-info-analysis/. */
async function gitDirtyHashes(): Promise<string[]> {
  try {
    const { stdout } = await execFile("git", ["status", "--porcelain", "--", BOOTH_INFO_DATA_DIR]);
    const hashes = new Set<string>();
    for (const line of stdout.split("\n")) {
      const path = line.slice(3).trim();
      if (!path) continue;
      const file = basename(path);
      const match = /^([0-9a-f]{64})\.\w/.exec(file);
      if (match?.[1]) hashes.add(match[1]);
    }
    return [...hashes];
  } catch {
    return [];
  }
}

/** Scan all prefix dirs and collect hashes that have the given extension. */
async function scanAllHashes(ext: string): Promise<string[]> {
  const hashes: string[] = [];
  let prefixDirs: string[];
  try {
    prefixDirs = await readdir(BOOTH_INFO_DATA_DIR);
  } catch {
    return [];
  }
  for (const prefix of prefixDirs) {
    const dir = resolve(BOOTH_INFO_DATA_DIR, prefix);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith(ext)) {
        hashes.push(file.slice(0, -ext.length));
      }
    }
  }
  return hashes;
}

/**
 * Discover a hash for `review`: needs either
 *  - `.png` without `.jsonl` (will be auto-analyzed), or
 *  - `.jsonl` with at least one pending product.
 * Checks git dirty first, then does a full scan.
 */
export async function discoverReviewHash(): Promise<string | undefined> {
  const needsReview = async (hash: string): Promise<boolean> => {
    const paths = boothInfoPaths(hash);
    const eligible = await isReviewEligible(hash);
    if (!eligible) return false;
    // PNG without JSONL — needs analysis then review
    if ((await fileExists(paths.png)) && !(await fileExists(paths.jsonl))) return true;
    // JSONL with pending variants — needs review
    try {
      const products = await readProducts(paths.jsonl);
      return products.some(
        (p) => p.audit_status === "pending" || p.variants.some((v) => v.status !== "approved"),
      );
    } catch {
      return false;
    }
  };

  const dirty = await gitDirtyHashes();
  for (const hash of dirty) {
    if (await needsReview(hash)) return hash;
  }

  // Check PNGs (may need analysis) and JSONLs (may need review)
  const pngHashes = await scanAllHashes(".png");
  for (const hash of pngHashes) {
    if (await needsReview(hash)) return hash;
  }

  const jsonlHashes = await scanAllHashes(".jsonl");
  for (const hash of jsonlHashes) {
    if (await needsReview(hash)) return hash;
  }

  return undefined;
}
