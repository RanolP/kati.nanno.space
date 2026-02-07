import { mkdir, readFile, writeFile } from "node:fs/promises";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamObject } from "ai";
import sharp from "sharp";
import { z } from "zod";

import { Ok, task, work } from "../features/task/index.ts";
import type { Task, OkType } from "../features/task/index.ts";
import { boothInfoPaths } from "./booth-info-shared.ts";
import type { BoothImageMeta } from "./booth-info-shared.ts";
import type { BBox, BoothProduct, ProductVariant } from "./booth-info-types.ts";
import { PIPELINE_VERSION } from "./booth-info-types.ts";

// Gemini uses 0-1000 normalized coordinates in [ymin, xmin, ymax, xmax] order.
// Using the magic field name "box_2d" triggers Gemini's specialized bbox training.
const coord = z.number().int().min(0).max(1000);

const box2dSchema = z.object({
  ymin: coord.describe("Top Y normalized to 0-1000"),
  xmin: coord.describe("Left X normalized to 0-1000"),
  ymax: coord.describe("Bottom Y normalized to 0-1000"),
  xmax: coord.describe("Right X normalized to 0-1000"),
});

const variantSchema = z.object({
  label: z.string().describe("Variant name in its original language"),
  box_2d: z.array(box2dSchema).describe("Bounding boxes for this variant, normalized to 0-1000"),
});

const productSchema = z.object({
  name: z.string().describe("Product name in its original language"),
  price: z.number().nullable().describe("Price in KRW as integer, or null if not visible"),
  price_raw: z.string().nullable().describe("Raw price text exactly as shown, or null"),
  variants: z.array(variantSchema).describe("Product variants"),
});

const responseSchema = z.object({
  products: z.array(productSchema),
});

type GeminiResponse = z.infer<typeof responseSchema>;

const SYSTEM_PROMPT = `You are analyzing an image of a booth selling subcultural merchandise.

Detect all products visible in the image. For each product, extract:
- name: The product name exactly as written (do not translate)
- price: Price in KRW as integer, or null if not visible
- price_raw: Raw price text exactly as shown, or null
- variants: Each variant with its label and bounding boxes

For bounding boxes: Locate each variant in the image. When you reference a variant, put its bounding box as [label](ymin xmin ymax xmax) where coordinates are normalized to 0-1000. Output these as box_2d objects with ymin, xmin, ymax, xmax fields.

Notes:
- Product names may mix English, Japanese, and Korean with special characters. Transcribe exactly as shown.
- Limit to 25 variants total across all products.

Return an empty products array if no products are visible.`;

const MAX_RETRIES = 3;

/** Rejected region with its bboxes to re-analyze. */
export interface ReanalyzeRegion {
  readonly bboxes: readonly BBox[];
}

function buildReanalyzePrompt(regions: ReanalyzeRegion[], meta: BoothImageMeta): string {
  const lines = regions.map((r) => {
    const coords = r.bboxes
      .map(([x1, y1, x2, y2]) => {
        const xmin = Math.round((x1 / meta.width) * 1000);
        const ymin = Math.round((y1 / meta.height) * 1000);
        const xmax = Math.round((x2 / meta.width) * 1000);
        const ymax = Math.round((y2 / meta.height) * 1000);
        return `[${ymin}, ${xmin}, ${ymax}, ${xmax}]`;
      })
      .join(", ");
    return `- Regions ${coords}`;
  });
  return `\n\nThe following regions seem too wide or too sparse to capture. You should re-analyze whether they shall be resized:\n${lines.join("\n")}`;
}

/** Run Gemini extraction on a PNG buffer, optionally re-analyzing rejected regions. */
export async function runGeminiExtraction(
  pngBuf: Buffer,
  reanalyzeRegions?: ReanalyzeRegion[],
  guide?: string,
): Promise<GeminiResponse> {
  const model = createGoogleGenerativeAI({ apiKey: process.env.CRAWLER_AI_KEY_GEMINI! })(
    "gemini-2.5-flash",
  );

  let systemPrompt = SYSTEM_PROMPT;
  if (reanalyzeRegions && reanalyzeRegions.length > 0) {
    const metadata = await sharp(pngBuf).metadata();
    const meta: BoothImageMeta = {
      url: "",
      width: metadata.width!,
      height: metadata.height!,
      sha256: "",
    };
    systemPrompt += buildReanalyzePrompt(reanalyzeRegions, meta);
  }
  if (guide) {
    systemPrompt += `\n\nAdditional guidance from the reviewer: ${guide}`;
  }

  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "image" as const, image: pngBuf, mimeType: "image/png" as const },
        { type: "text" as const, text: "Extract products and their variant bounding boxes." },
      ],
    },
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = streamObject({
        model,
        schema: responseSchema,
        system: systemPrompt,
        messages,
        temperature: 0.5,
        providerOptions: {
          google: { thinkingConfig: { thinkingBudget: 0 } },
        },
      });

      // Consume the stream
      for await (const _partial of result.partialObjectStream) {
        // just consume
      }

      return await result.object;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error("Unreachable");
}

/** Convert Gemini response to BoothProduct array. */
export function geminiToProducts(
  result: GeminiResponse,
  hash: string,
  meta: BoothImageMeta,
): BoothProduct[] {
  const now = new Date().toISOString();
  return result.products.map((p, i) => ({
    image_sha256: hash,
    image_url: meta.url,
    image_width: meta.width,
    image_height: meta.height,
    product_index: i,
    name: p.name,
    price: p.price,
    price_raw: p.price_raw,
    variants: p.variants.map(
      (v): ProductVariant => ({
        name: v.label,
        images: v.box_2d.map(
          (b): BBox => [
            Math.round((b.xmin / 1000) * meta.width),
            Math.round((b.ymin / 1000) * meta.height),
            Math.round((b.xmax / 1000) * meta.width),
            Math.round((b.ymax / 1000) * meta.height),
          ],
        ),
        status: "pending",
      }),
    ),
    auditor: null,
    audit_status: "pending" as const,
    audit_errors: [],
    audit_timestamp: null,
    pipeline_version: PIPELINE_VERSION,
    created_at: now,
  }));
}

export function boothInfoAnalyze(hash: string): Task<BoothProduct[]> {
  return task("booth-info/analyze", function* () {
    const paths = boothInfoPaths(hash);

    const { pngBuf, meta } = yield* work(async ($) => {
      $.description(`Reading image and metadata — ${hash.slice(0, 12)}…`);
      const png = await readFile(paths.png);

      let meta: BoothImageMeta;
      try {
        meta = JSON.parse(await readFile(paths.meta, "utf8")) as BoothImageMeta;
      } catch {
        // No .meta.json — derive from the PNG itself
        const metadata = await sharp(png).metadata();
        meta = { url: "", width: metadata.width!, height: metadata.height!, sha256: hash };
      }

      return { pngBuf: png, meta };
    });

    const extractedProducts = yield* work(async ($) => {
      const hashLabel = hash.slice(0, 12);
      $.description(`Extracting products (Gemini 2.5 Flash) — ${hashLabel}…`);
      return await runGeminiExtraction(pngBuf);
    });

    const products = geminiToProducts(extractedProducts, hash, meta);

    yield* work(async ($) => {
      $.description(
        `Writing ${products.length} products → ${hash.slice(0, 4)}/${hash.slice(0, 12)}…`,
      );
      await mkdir(paths.dir, { recursive: true });
      const jsonl = `${products.map((p) => JSON.stringify(p)).join("\n")}\n`;
      await writeFile(paths.jsonl, jsonl, "utf8");
    });

    return Ok(products) as OkType<BoothProduct[]>;
  });
}
