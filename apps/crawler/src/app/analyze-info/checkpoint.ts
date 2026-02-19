import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ImageAnalysisResult {
  confidence: number;
  reason: string;
}

export interface AnalyzeInfoCheckpoint {
  /** Media URL → classification result (skip already-classified images) */
  classified_images: Map<string, ImageAnalysisResult>;
}

interface CheckpointJson {
  classified_images: Record<string, ImageAnalysisResult>;
}

export function emptyAnalyzeCheckpoint(): AnalyzeInfoCheckpoint {
  return {
    classified_images: new Map(),
  };
}

export async function loadAnalyzeCheckpoint(path: string): Promise<AnalyzeInfoCheckpoint> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return emptyAnalyzeCheckpoint();
  }

  const json = JSON.parse(raw) as CheckpointJson;
  return {
    classified_images: json.classified_images
      ? new Map(Object.entries(json.classified_images))
      : new Map(),
  };
}

export async function saveAnalyzeCheckpoint(
  path: string,
  checkpoint: AnalyzeInfoCheckpoint,
): Promise<void> {
  const json: CheckpointJson = {
    classified_images: Object.fromEntries(
      [...checkpoint.classified_images.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
    ),
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(json, undefined, 2)}\n`, "utf8");
}
