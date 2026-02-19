import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface TwitterScanState {
  newest_seen_tweet_id: string;
}

export interface FindInfoCheckpoint {
  illustar_fetched: Set<number>;
  twitter_scans: Map<string, TwitterScanState>;
  /** Conversation IDs whose threads have already been fetched */
  threads_fetched: Set<string>;
  witchform_fetched: Set<string>;
}

interface CheckpointJson {
  illustar_fetched: number[];
  twitter_scans: Record<string, TwitterScanState>;
  threads_fetched: string[];
  witchform_fetched: string[];
}

export function emptyCheckpoint(): FindInfoCheckpoint {
  return {
    illustar_fetched: new Set(),
    twitter_scans: new Map(),
    threads_fetched: new Set(),
    witchform_fetched: new Set(),
  };
}

export async function loadCheckpoint(path: string): Promise<FindInfoCheckpoint> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return emptyCheckpoint();
  }

  const json = JSON.parse(raw) as CheckpointJson;
  return {
    illustar_fetched: new Set(json.illustar_fetched),
    twitter_scans: new Map(Object.entries(json.twitter_scans)),
    threads_fetched: json.threads_fetched ? new Set(json.threads_fetched) : new Set(),
    witchform_fetched: new Set(json.witchform_fetched),
  };
}

export async function saveCheckpoint(path: string, checkpoint: FindInfoCheckpoint): Promise<void> {
  const json: CheckpointJson = {
    illustar_fetched: [...checkpoint.illustar_fetched].toSorted((a, b) => a - b),
    twitter_scans: Object.fromEntries(
      [...checkpoint.twitter_scans.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
    ),
    threads_fetched: [...checkpoint.threads_fetched].toSorted(),
    witchform_fetched: [...checkpoint.witchform_fetched].toSorted(),
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(json, undefined, 2)}\n`, "utf8");
}
