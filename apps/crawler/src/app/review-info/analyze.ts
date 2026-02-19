import { mkdir, readFile, writeFile } from "node:fs/promises";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamObject } from "ai";
import sharp from "sharp";
import { z } from "zod";

import { Ok, task, work } from "../../features/task/index.ts";
import type { Task, OkType } from "../../features/task/index.ts";
import { boothInfoPaths } from "./shared.ts";
import type { BoothImageMeta } from "./shared.ts";
import type { BBox, BoothProduct, ProductVariant } from "./types.ts";
import { normalizeVariantImages, PIPELINE_VERSION } from "./types.ts";

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

const groupSchema = z.object({
  groups: z.array(
    z.object({
      label: z.string().describe("Group label"),
      box_2d: box2dSchema.describe("Bounding box of item group, normalized to 0-1000"),
    }),
  ),
});

type GroupResponse = z.infer<typeof groupSchema>;
const complexitySchema = z.object({
  complexity: z.enum(["simple", "complex"]),
  reason: z.string().optional(),
});
type GeminiProduct = GeminiResponse["products"][number];

export interface GeminiExtractionResult {
  readonly products: readonly (GeminiProduct & { readonly area?: BBox })[];
}

export interface ExtractionOptions {
  readonly reviewComplexityCheck?: boolean;
}

const SYSTEM_PROMPT = `You are analyzing an image of a booth selling subcultural merchandise.

Detect all products visible in the image. For each product, extract:
- name: The product name exactly as written (do not translate)
- price: Price in KRW as integer, or null if not visible
- price_raw: Raw price text exactly as shown, or null
- variants: Each variant with its label and bounding boxes

For bounding boxes: Locate each variant in the image. When you reference a variant, put its bounding box as [label](ymin xmin ymax xmax) where coordinates are normalized to 0-1000. Output these as box_2d objects with ymin, xmin, ymax, xmax fields.

CRITICAL BOUNDING BOX RULES (must follow):
- Each variant MUST have exactly ONE bounding box.
- Never return multiple boxes for one variant.
- If uncertain, choose the single tightest box around the most representative visible instance.
- Do not merge distant instances into a wide box; choose one instance only.
- If you cannot localize a variant to one clear region, omit that variant.
- Box the actual product instance, not labels/text/price text/background.
- Do not point to neighboring items, headers, or decorative graphics.
- If the visual match is ambiguous, omit the variant (prefer missing over wrong).
- Final self-check: box center must lie on the intended product region.

Notes:
- Product names may mix English, Japanese, and Korean with special characters. Transcribe exactly as shown.
- Limit to 25 variants total across all products.

Return an empty products array if no products are visible.`;

const MAX_RETRIES = 3;
const MAX_GROUPS = 8;
const GROUP_PADDING_PX = 16;

/** Rejected region with its bboxes to re-analyze. */
export interface ReanalyzeRegion {
  readonly bboxes: readonly BBox[];
}

function toPixelBox(
  box: z.infer<typeof box2dSchema>,
  width: number,
  height: number,
): readonly [x1: number, y1: number, x2: number, y2: number] {
  const x1 = Math.round((box.xmin / 1000) * width);
  const y1 = Math.round((box.ymin / 1000) * height);
  const x2 = Math.round((box.xmax / 1000) * width);
  const y2 = Math.round((box.ymax / 1000) * height);
  return [Math.max(0, x1), Math.max(0, y1), Math.min(width, x2), Math.min(height, y2)];
}

function clampCrop(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, Math.min(x1, width - 1));
  const top = Math.max(0, Math.min(y1, height - 1));
  const right = Math.max(left + 1, Math.min(x2, width));
  const bottom = Math.max(top + 1, Math.min(y2, height));
  return { left, top, width: right - left, height: bottom - top };
}

async function runStructuredExtraction<T extends z.ZodTypeAny>(
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>,
  schema: T,
  system: string,
  userText: string,
  image: Buffer,
): Promise<z.infer<T>> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = streamObject({
        model,
        schema,
        system,
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "image" as const, image, mimeType: "image/png" as const },
              { type: "text" as const, text: userText },
            ],
          },
        ],
        temperature: 0.1,
        providerOptions: {
          google: { thinkingConfig: { thinkingBudget: 0 } },
        },
      });

      for await (const _partial of result.partialObjectStream) {
        // consume
      }
      return await result.object;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error("Unreachable");
}

async function detectGroups(
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>,
  pngBuf: Buffer,
): Promise<GroupResponse> {
  return await runStructuredExtraction(
    model,
    groupSchema,
    `You are segmenting a booth merchandise info-sheet image into item groups.

Find coarse item groups first (clustered product areas/sections), not individual variants.
- Return 1-8 non-overlapping group boxes that together cover product regions.
- Exclude blank margins, decorative headers, and unrelated areas.
- Prefer tighter regions around product clusters.`,
    "Detect item groups and return only group bounding boxes.",
    pngBuf,
  );
}

function buildForcedGridGroups(
  width: number,
  height: number,
): readonly { box_2d: z.infer<typeof box2dSchema> }[] {
  const cols = width >= height ? 3 : 2;
  const rows = width >= height ? 2 : 3;
  const groups: { box_2d: z.infer<typeof box2dSchema> }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xmin = Math.round((c / cols) * 1000);
      const xmax = Math.round(((c + 1) / cols) * 1000);
      const ymin = Math.round((r / rows) * 1000);
      const ymax = Math.round(((r + 1) / rows) * 1000);
      groups.push({ box_2d: { xmin, ymin, xmax, ymax } });
    }
  }
  return groups;
}

async function classifyImageComplexity(
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>,
  pngBuf: Buffer,
): Promise<"simple" | "complex"> {
  try {
    const result = await runStructuredExtraction(
      model,
      complexitySchema,
      `You are a strict classifier for booth info-sheet visual complexity.

Classify as "complex" when dense/heterogeneous layout is likely to benefit from forced region-splitting.
Examples: many product clusters, multiple panels/sections, crowded text+item blocks, mixed decorative elements around products.

Classify as "simple" when a small number of clearly separated item clusters can be extracted reliably without forced tiling.

Return JSON only.`,
      "Classify this image as simple or complex for extraction strategy.",
      pngBuf,
    );
    return result.complexity;
  } catch {
    return "simple";
  }
}

function mapCropProductsToGlobal(
  local: GeminiResponse,
  crop: { left: number; top: number; width: number; height: number },
  full: { width: number; height: number },
): GeminiResponse {
  const products = local.products.map((p) => ({
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      box_2d: v.box_2d.map((b) => {
        const lx1 = (b.xmin / 1000) * crop.width;
        const ly1 = (b.ymin / 1000) * crop.height;
        const lx2 = (b.xmax / 1000) * crop.width;
        const ly2 = (b.ymax / 1000) * crop.height;

        const gx1 = crop.left + lx1;
        const gy1 = crop.top + ly1;
        const gx2 = crop.left + lx2;
        const gy2 = crop.top + ly2;

        return {
          xmin: Math.max(0, Math.min(1000, Math.round((gx1 / full.width) * 1000))),
          ymin: Math.max(0, Math.min(1000, Math.round((gy1 / full.height) * 1000))),
          xmax: Math.max(0, Math.min(1000, Math.round((gx2 / full.width) * 1000))),
          ymax: Math.max(0, Math.min(1000, Math.round((gy2 / full.height) * 1000))),
        };
      }),
    })),
  }));
  return { products };
}

/** Run Gemini extraction on a PNG buffer, optionally re-analyzing rejected regions. */
export async function runGeminiExtraction(
  pngBuf: Buffer,
  reanalyzeRegions?: ReanalyzeRegion[],
  guide?: string,
  options?: ExtractionOptions,
): Promise<GeminiExtractionResult> {
  const google = createGoogleGenerativeAI({ apiKey: process.env.CRAWLER_AI_KEY_GEMINI! });
  const model = google("gemini-3-flash");
  const complexityModel = google("gemini-3-flash");
  const metadata = await sharp(pngBuf).metadata();
  const fullWidth = metadata.width ?? 0;
  const fullHeight = metadata.height ?? 0;
  if (fullWidth <= 0 || fullHeight <= 0) return { products: [] };

  let systemPrompt = SYSTEM_PROMPT;
  if (guide) systemPrompt += `\n\nAdditional guidance from the reviewer: ${guide}`;

  const extractionText =
    "Extract products and variants from this crop. IMPORTANT: exactly one tight bounding box per variant on the correct product instance (not text/background).";

  // Stage 1: detect group regions
  const shouldClassifyComplexity =
    options?.reviewComplexityCheck === true &&
    (reanalyzeRegions == undefined || reanalyzeRegions.length === 0);
  const complexity = shouldClassifyComplexity
    ? await classifyImageComplexity(complexityModel, pngBuf)
    : "simple";
  const forcedGroups =
    complexity === "complex"
      ? buildForcedGridGroups(fullWidth, fullHeight).slice(0, MAX_GROUPS)
      : [];

  const detectedGroups: readonly { box_2d: z.infer<typeof box2dSchema> }[] =
    reanalyzeRegions && reanalyzeRegions.length > 0
      ? reanalyzeRegions
          .map((r) => {
            if (r.bboxes.length === 0) return undefined;
            const xs1 = r.bboxes.map((b) => b[0]);
            const ys1 = r.bboxes.map((b) => b[1]);
            const xs2 = r.bboxes.map((b) => b[2]);
            const ys2 = r.bboxes.map((b) => b[3]);
            const x1 = Math.min(...xs1);
            const y1 = Math.min(...ys1);
            const x2 = Math.max(...xs2);
            const y2 = Math.max(...ys2);
            return {
              box_2d: {
                xmin: Math.round((x1 / fullWidth) * 1000),
                ymin: Math.round((y1 / fullHeight) * 1000),
                xmax: Math.round((x2 / fullWidth) * 1000),
                ymax: Math.round((y2 / fullHeight) * 1000),
              },
            };
          })
          .filter((g) => g != undefined)
      : forcedGroups.length > 0
        ? forcedGroups
        : (await detectGroups(model, pngBuf)).groups.slice(0, MAX_GROUPS);

  if (detectedGroups.length === 0) {
    return await runStructuredExtraction(
      model,
      responseSchema,
      systemPrompt,
      extractionText,
      pngBuf,
    );
  }

  // Stage 2: analyze each group crop, then map coords back to full image space.
  const mergedProducts: (GeminiProduct & { area?: BBox })[] = [];
  for (const g of detectedGroups) {
    const [x1, y1, x2, y2] = toPixelBox(g.box_2d, fullWidth, fullHeight);
    const crop = clampCrop(
      x1 - GROUP_PADDING_PX,
      y1 - GROUP_PADDING_PX,
      x2 + GROUP_PADDING_PX,
      y2 + GROUP_PADDING_PX,
      fullWidth,
      fullHeight,
    );
    const cropBuf = await sharp(pngBuf)
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.width,
        height: crop.height,
      })
      .png()
      .toBuffer();

    const local = await runStructuredExtraction(
      model,
      responseSchema,
      systemPrompt,
      extractionText,
      cropBuf,
    );
    const global = mapCropProductsToGlobal(local, crop, { width: fullWidth, height: fullHeight });
    const area: BBox = [x1, y1, x2, y2];
    mergedProducts.push(...global.products.map((p) => ({ ...p, area })));
  }

  return { products: mergedProducts };
}

/** Convert Gemini response to BoothProduct array. */
export function geminiToProducts(
  result: GeminiExtractionResult,
  hash: string,
  meta: BoothImageMeta,
): BoothProduct[] {
  const now = new Date().toISOString();
  return result.products.map((p, i) => {
    const product: BoothProduct = {
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
          images: normalizeVariantImages(
            v.box_2d.map(
              (b): BBox => [
                Math.round((b.xmin / 1000) * meta.width),
                Math.round((b.ymin / 1000) * meta.height),
                Math.round((b.xmax / 1000) * meta.width),
                Math.round((b.ymax / 1000) * meta.height),
              ],
            ),
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
      ...(p.area ? { area: p.area } : {}),
    };
    return product;
  });
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
        meta = {
          url: "",
          width: metadata.width!,
          height: metadata.height!,
          sha256: hash,
          confidence: 1,
          reason: "",
        };
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
