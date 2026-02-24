import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";
import { Result } from "true-myth";

const execFile = promisify(execFileCb);

export type ExtractPngErrorCode = "UNSUPPORTED_IMAGE_CODEC" | "VIDEO_FORMAT_UNSUPPORTED";

export interface ExtractPngError {
  readonly code: ExtractPngErrorCode;
  readonly message: string;
}

export async function extractPng(
  data: Buffer,
  contentType: string,
): Promise<Result<Buffer, ExtractPngError>> {
  const [mediaType] = contentType.toLowerCase().split("/");

  switch (mediaType) {
    case "image": {
      try {
        const png = await sharp(data).png().toBuffer();
        return Result.ok(png);
      } catch {
        return Result.err({
          code: "UNSUPPORTED_IMAGE_CODEC",
          message: "Unsupported image codec for Sharp",
        });
      }
    }
    case "video": {
      return await extractStillFromVideo(data);
    }
    default: {
      throw new Error(`Unsupported media content-type: ${contentType || "(missing)"}`);
    }
  }
}

async function extractStillFromVideo(videoBytes: Buffer): Promise<Result<Buffer, ExtractPngError>> {
  const tempDir = await mkdtemp(join(tmpdir(), "kati-workflows-media-"));
  const inputPath = join(tempDir, "input.bin");
  const framePattern = join(tempDir, "frame-%03d.png");

  try {
    await writeFile(inputPath, videoBytes);

    const probe = await execFile("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      inputPath,
    ]);
    const parsed = JSON.parse(probe.stdout) as { format?: { duration?: string } };
    const duration = Number(parsed.format?.duration ?? "0");
    if (!Number.isFinite(duration) || duration > 1) {
      return Result.err({
        code: "VIDEO_FORMAT_UNSUPPORTED",
        message: "Video is not STILL-CUT-BUT-VIDEO-FORMAT (duration > 1s)",
      });
    }

    await execFile("ffmpeg", [
      "-v",
      "error",
      "-i",
      inputPath,
      "-t",
      "1",
      "-vf",
      "mpdecimate",
      "-fps_mode",
      "vfr",
      framePattern,
    ]);

    const files = await readdir(tempDir);
    const frameNames = files.filter((x) => x.startsWith("frame-") && x.endsWith(".png")).toSorted();
    if (frameNames.length === 0) {
      return Result.err({
        code: "VIDEO_FORMAT_UNSUPPORTED",
        message: "Video has no decodable frame",
      });
    }

    if (frameNames.length > 1) {
      return Result.err({
        code: "VIDEO_FORMAT_UNSUPPORTED",
        message: "Video has non-identical frames; not STILL-CUT-BUT-VIDEO-FORMAT",
      });
    }

    const png = await readFile(join(tempDir, frameNames[0]!));
    return Result.ok(png);
  } finally {
    void rm(tempDir, { recursive: true, force: true });
  }
}
