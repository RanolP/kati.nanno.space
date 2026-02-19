/** @jsxImportSource hono/jsx */
import { createHash } from "node:crypto";
import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { serve } from "@hono/node-server";
import { streamObject } from "ai";
import { Hono } from "hono";
import sharp from "sharp";
import { z } from "zod";

import { Ok, task, work } from "../features/task/index.ts";
import type { Task, OkType } from "../features/task/index.ts";
import type { AuditStatus, BoothProduct } from "./review-info/types.ts";
import { PIPELINE_VERSION } from "./review-info/types.ts";

const execFile = promisify(execFileCb);

const dataDir = resolve(import.meta.dirname!, "../../../../data/booth-info-analysis");

const bboxSchema = z.object({
  x: z.number().describe("Left X in pixels"),
  y: z.number().describe("Top Y in pixels"),
  w: z.number().describe("Width in pixels"),
  h: z.number().describe("Height in pixels"),
});

const variantSchema = z.object({
  name: z.string().describe("Variant name in its original language"),
  images: z.array(bboxSchema).describe("Bounding boxes for this variant"),
});

const productSchema = z.object({
  name: z.string().describe("Product name in its original language"),
  price: z.number().nullable().describe("Price in KRW as integer, or null if not visible"),
  price_raw: z.string().nullable().describe("Raw price text exactly as shown, or null"),
  variants: z.array(variantSchema).describe("Product variants"),
});

const responseSchema = z.object({
  perceived_width: z.number().describe("Image width in pixels as you perceive it"),
  perceived_height: z.number().describe("Image height in pixels as you perceive it"),
  products: z.array(productSchema),
});

const SYSTEM_PROMPT = `Given: Image describing a booth selling subcultural merchs.

Goal: Extract what product they sell.
Detail: Especially we need
- The name of product
- The price of product
- The variant of product
   - Each variant can contain image set related to itself, using x, y, w, h format.

Notes:
- The products may use English, Japanese, and Korean. some of them utilizes special characters wisely. Transcribe with caution.
- You should not translate the name of product. The mix of languages are intention of the store. You should respect.

Return an empty products array if no products are visible.`;

export function crawlBoothInfo(url: string): Task<BoothProduct[]> {
  return task("booth-info", function* () {
    // Step 1: Download image, convert to PNG, compute hash + dimensions
    const imageData = yield* work(async ($) => {
      $.description(`Downloading image — ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
      const arrayBuf = await resp.arrayBuffer();
      const pipeline = sharp(Buffer.from(arrayBuf)).png();
      const [pngBuf, metadata] = await Promise.all([pipeline.toBuffer(), pipeline.metadata()]);
      const sha256 = createHash("sha256").update(pngBuf).digest("hex");
      return { buf: pngBuf, sha256, width: metadata.width!, height: metadata.height! };
    });

    // Step 2: Call Gemini 2.5 Pro for structured extraction (streaming + retry)
    const MAX_RETRIES = 3;
    const extractedProducts = yield* work(async ($) => {
      const hashLabel = imageData.sha256.slice(0, 12);
      const model = createGoogleGenerativeAI({ apiKey: process.env.CRAWLER_AI_KEY_GEMINI! })(
        "gemini-2.5-pro",
      );
      const messages = [
        {
          role: "user" as const,
          content: [
            { type: "image" as const, image: imageData.buf, mimeType: "image/png" as const },
            { type: "text" as const, text: `Image size: ${imageData.width}x${imageData.height}px` },
          ],
        },
      ];

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        $.description(
          attempt === 1
            ? `Extracting products (Gemini 2.5 Pro) — ${hashLabel}…`
            : `Retrying extraction (${attempt}/${MAX_RETRIES}) — ${hashLabel}…`,
        );

        try {
          const result = streamObject({
            model,
            schema: responseSchema,
            system: SYSTEM_PROMPT,
            messages,
            onError({ error }) {
              $.description(`Error: ${error instanceof Error ? error.message : String(error)}`);
            },
          });

          let productCount = 0;
          for await (const partial of result.partialObjectStream) {
            const count = partial.products?.length ?? 0;
            if (count !== productCount) {
              productCount = count;
              $.progress({ kind: "count", value: productCount });
            }
          }

          const final = await result.object;
          return final;
        } catch (error) {
          if (attempt === MAX_RETRIES) throw error;
          $.description(`Retry ${attempt} failed, waiting… — ${hashLabel}…`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }

      throw new Error("Unreachable");
    });

    // Step 3: Map to BoothProduct[] (scale bboxes from perceived → actual dimensions)
    const scaleX = imageData.width / extractedProducts.perceived_width;
    const scaleY = imageData.height / extractedProducts.perceived_height;
    const now = new Date().toISOString();
    const products: BoothProduct[] = extractedProducts.products.map((p, i) => ({
      image_sha256: imageData.sha256,
      image_url: url,
      image_width: imageData.width,
      image_height: imageData.height,
      product_index: i,
      name: p.name,
      price: p.price,
      price_raw: p.price_raw,
      variants: p.variants.map((v) => ({
        name: v.name,
        status: "pending",
        images: v.images.map(
          (b) =>
            [
              Math.round(b.x * scaleX),
              Math.round(b.y * scaleY),
              Math.round(b.w * scaleX),
              Math.round(b.h * scaleY),
            ] as const,
        ),
      })),
      auditor: null,
      audit_status: "pending" as const,
      audit_errors: [],
      audit_timestamp: null,
      pipeline_version: PIPELINE_VERSION,
      created_at: now,
    }));

    // Step 4: Persist to data/booth-info-analysis/{hash[:4]}/{hash}.jsonl
    const prefix = imageData.sha256.slice(0, 4);
    const outDir = resolve(dataDir, prefix);
    const outPath = resolve(outDir, `${imageData.sha256}.jsonl`);
    const jsonl = `${products.map((p) => JSON.stringify(p)).join("\n")}\n`;

    yield* work(async ($) => {
      $.description(
        `Writing ${products.length} products → ${prefix}/${imageData.sha256.slice(0, 12)}…`,
      );
      await mkdir(outDir, { recursive: true });
      await writeFile(outPath, jsonl, "utf8");
    });

    // Step 5: Start validation server and wait for human review
    const validated = yield* work(async ($) => {
      $.description(`Waiting for human review — http://localhost:3001/review/${imageData.sha256}`);
      return await runValidationServer(imageData.sha256);
    });

    return Ok(validated) as OkType<BoothProduct[]>;
  });
}

// --- Validation server ---

async function getGitUser(): Promise<string> {
  try {
    const { stdout } = await execFile("git", ["config", "user.name"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function readProducts(filePath: string): Promise<BoothProduct[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as BoothProduct);
}

const AUDIT_COLORS: Record<AuditStatus, string> = {
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  corrected: "#6366f1",
};

const VARIANT_COLORS = [
  "#2563eb",
  "#d946ef",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#e11d48",
  "#8b5cf6",
  "#14b8a6",
];

function StatusBadge({ status }: { status: AuditStatus }) {
  return (
    <span
      style={`background:${AUDIT_COLORS[status]};color:white;padding:2px 8px;border-radius:4px;font-size:12px`}
    >
      {status}
    </span>
  );
}

function ReviewPage({
  hash,
  idx,
  products,
}: {
  hash: string;
  idx: number;
  products: BoothProduct[];
}) {
  const p = products[idx]!;
  const imgW = p.image_width;
  const imgH = p.image_height;
  const vmin = Math.min(imgW, imgH);
  const strokeWidth = vmin * 0.01;
  const color = VARIANT_COLORS[idx % VARIANT_COLORS.length]!;
  const allReviewed = products.every((pr) => pr.audit_status !== "pending");

  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>
          Review #{idx} — {p.name}
        </title>
        <style>{`
          body { font-family: system-ui, sans-serif; max-width: 1400px; margin: 0 auto; padding: 20px; }
          .nav { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
          .nav a.btn { padding: 6px 16px; background: #e5e7eb; border-radius: 4px; text-decoration: none; color: #111; }
          .dots { display: flex; gap: 4px; flex-wrap: wrap; }
          .dot { display: inline-block; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; color: white; font-size: 12px; text-decoration: none; }
          .layout { display: flex; gap: 20px; }
          .image-panel { flex: 1; position: sticky; top: 20px; align-self: flex-start; }
          .image-panel svg { width: 100%; height: auto; }
          .products-panel { flex: 1; }
          button { background: #2563eb; color: white; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; }
          select, input[type="text"] { padding: 6px; border: 1px solid #ddd; border-radius: 4px; }
          .done-banner { background: #10b981; color: white; padding: 12px 20px; border-radius: 8px; text-align: center; font-size: 18px; margin-bottom: 16px; }
        `}</style>
      </head>
      <body>
        <div class="nav">
          {idx > 0 && (
            <a class="btn" href={`/review/${hash}/${idx - 1}`}>
              &larr; Prev
            </a>
          )}
          <div class="dots">
            {products.map((pr, i) => (
              <a
                class="dot"
                href={`/review/${hash}/${i}`}
                style={`background:${AUDIT_COLORS[pr.audit_status]};${i === idx ? "border:2px solid #000;" : ""}`}
                title={pr.name}
              >
                {i}
              </a>
            ))}
          </div>
          {idx < products.length - 1 && (
            <a class="btn" href={`/review/${hash}/${idx + 1}`}>
              Next &rarr;
            </a>
          )}
        </div>

        {allReviewed && (
          <div class="done-banner">All products reviewed! Server will shut down automatically.</div>
        )}

        <div class="layout">
          <div class="image-panel">
            <svg viewBox={`0 0 ${imgW} ${imgH}`} style="width:100%;height:auto">
              <image
                href={`/proxy?url=${encodeURIComponent(p.image_url)}`}
                width={imgW}
                height={imgH}
              />
              {p.variants.flatMap((v, vi) =>
                v.images.map(([x, y, w, h]) => (
                  <g>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill="none"
                      stroke={color}
                      stroke-width={strokeWidth}
                      opacity="0.8"
                    />
                    <text x={x} y={y - 5} fill={color} font-size="14" font-weight="bold">
                      {v.name}
                      {v.images.length > 1 ? ` [${vi}]` : ""}
                    </text>
                  </g>
                )),
              )}
            </svg>
          </div>

          <div class="products-panel">
            <h2>
              #{idx} {p.name} <StatusBadge status={p.audit_status} />
            </h2>
            <p>
              Price: {p.price_raw ?? "N/A"} ({p.price ?? "N/A"} KRW)
            </p>
            <h3>Variants</h3>
            <ul>
              {p.variants.map((v) => (
                <li>
                  {v.name} — {v.images.length} image(s)
                </li>
              ))}
            </ul>
            <form
              method="post"
              action={`/review/${hash}/${idx}`}
              style="display:flex;gap:8px;align-items:center;margin-top:16px"
            >
              <select name="audit_status">
                <option value="approved" selected={p.audit_status === "approved"}>
                  Approve
                </option>
                <option value="rejected" selected={p.audit_status === "rejected"}>
                  Reject
                </option>
                <option value="corrected" selected={p.audit_status === "corrected"}>
                  Corrected
                </option>
                <option value="pending" selected={p.audit_status === "pending"}>
                  Pending
                </option>
              </select>
              <input
                type="text"
                name="audit_errors"
                placeholder="errors (comma-separated)"
                value={p.audit_errors.join(", ")}
                style="flex:1"
              />
              <button type="submit">Save</button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
}

function runValidationServer(hash: string, port = 3001): Promise<BoothProduct[]> {
  return new Promise((resolve) => {
    const app = new Hono();

    app.get("/", (c) => c.redirect(`/review/${hash}/0`));
    app.get("/review/:hash", (c) => c.redirect(`/review/${c.req.param("hash")}/0`));

    app.get("/review/:hash/:index", async (c) => {
      const h = c.req.param("hash");
      const idx = Number(c.req.param("index"));
      const prefix = h.slice(0, 4);
      const fp = join(dataDir, prefix, `${h}.jsonl`);

      let products: BoothProduct[];
      try {
        products = await readProducts(fp);
      } catch {
        return c.text("Analysis not found", 404);
      }

      if (idx < 0 || idx >= products.length) return c.redirect(`/review/${h}/0`);

      return c.html(<ReviewPage hash={h} idx={idx} products={products} />);
    });

    app.post("/review/:hash/:index", async (c) => {
      const h = c.req.param("hash");
      const idx = Number(c.req.param("index"));
      const prefix = h.slice(0, 4);
      const fp = join(dataDir, prefix, `${h}.jsonl`);

      let products: BoothProduct[];
      try {
        products = await readProducts(fp);
      } catch {
        return c.text("Analysis not found", 404);
      }

      const body = await c.req.parseBody();
      const auditStatus = String(body["audit_status"]) as AuditStatus;
      const auditErrors = String(body["audit_errors"] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const auditor = await getGitUser();

      products = products.map((p, i) => {
        if (i !== idx) return p;
        return {
          ...p,
          audit_status: auditStatus,
          audit_errors: auditErrors,
          auditor,
          audit_timestamp: new Date().toISOString(),
        };
      });

      const jsonl = `${products.map((p) => JSON.stringify(p)).join("\n")}\n`;
      await writeFile(fp, jsonl, "utf8");

      if (products.every((p) => p.audit_status !== "pending")) {
        setTimeout(() => {
          server.close();
          resolve(products);
        }, 500);
        return c.redirect(`/review/${h}/${idx}`);
      }

      const next = products.findIndex((p, i) => i > idx && p.audit_status === "pending");
      const target = next !== -1 ? next : products.findIndex((p) => p.audit_status === "pending");
      return c.redirect(`/review/${h}/${target !== -1 ? target : idx}`);
    });

    app.get("/proxy", async (c) => {
      const url = c.req.query("url");
      if (!url) return c.text("Missing url parameter", 400);

      const resp = await fetch(url);
      const contentType = resp.headers.get("content-type") ?? "image/jpeg";
      const buffer = await resp.arrayBuffer();

      return c.body(buffer, 200, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      });
    });

    const server = serve({ fetch: app.fetch, port }, (info) => {
      console.log(`\nValidation server: http://localhost:${info.port}/review/${hash}/0`);
      console.log("Review all products to continue.\n");
    });
  });
}
