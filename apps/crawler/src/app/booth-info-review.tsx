/** @jsxImportSource hono/jsx */
import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { raw } from "hono/html";
import sharp from "sharp";

import { Ok, task, work } from "../features/task/index.ts";
import type { Task, OkType } from "../features/task/index.ts";
import { boothInfoPaths, readProducts } from "./booth-info-shared.ts";
import { runGeminiExtraction, geminiToProducts } from "./booth-info-analyze.ts";
import type { ReanalyzeRegion } from "./booth-info-analyze.ts";
import type { BoothImageMeta } from "./booth-info-shared.ts";
import { deriveProductAuditStatus } from "./booth-info-types.ts";
import type { AuditStatus, BBox, BoothProduct, VariantStatus } from "./booth-info-types.ts";

const execFile = promisify(execFileCb);

const STATUS_COLORS: Record<VariantStatus, string> = {
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  excluded: "#9ca3af",
};

const AUDIT_COLORS: Record<AuditStatus, string> = {
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  corrected: "#6366f1",
};

async function getGitUser(): Promise<string> {
  try {
    const { stdout } = await execFile("git", ["config", "user.name"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

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
  reanalyzing,
}: {
  hash: string;
  idx: number;
  products: BoothProduct[];
  reanalyzing?: boolean;
}) {
  const product = products[idx]!;
  const { image_width: imgW, image_height: imgH } = product;
  const strokeWidth = Math.min(imgW, imgH) * 0.01;
  const allDone = products.every((p) => p.variants.every((v) => v.status === "approved"));
  const hasRejected = product.variants.some((v) => v.status === "rejected");

  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>
          Review #{idx} — {product.name}
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
          button, .btn-submit { border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; }
          .btn-submit { background: #2563eb; color: white; font-size: 16px; padding: 10px 24px; }
          input[type="text"] { padding: 6px; border: 1px solid #ddd; border-radius: 4px; }
          .done-banner { background: #10b981; color: white; padding: 12px 20px; border-radius: 8px; text-align: center; font-size: 18px; margin-bottom: 16px; }
          .reanalyze-banner { background: #6366f1; color: white; padding: 12px 20px; border-radius: 8px; text-align: center; font-size: 16px; margin-bottom: 16px; }
          .variant-block { margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; }
          .variant-row { display: flex; align-items: center; gap: 8px; }
          .bbox-tag { display: inline-flex; align-items: center; gap: 2px; background: #f3f4f6; border-radius: 4px; padding: 2px 6px; font-size: 11px; font-family: monospace; }
          .bbox-tag.excluded { opacity: 0.4; text-decoration: line-through; }
          .bbox-exclude-btn { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1; }
          .bbox-exclude-btn:hover { color: #ef4444; }
          .variant-swatch { width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0; }
          .variant-name { flex: 1; font-weight: 500; }
          .variant-imgs { color: #6b7280; font-size: 13px; }
          .toggle-btn { padding: 4px 12px; border-radius: 4px; font-size: 13px; border: 2px solid transparent; }
          .toggle-btn.approve { background: #d1fae5; color: #065f46; }
          .toggle-btn.approve.active { background: #10b981; color: white; border-color: #065f46; }
          .toggle-btn.reject { background: #fee2e2; color: #991b1b; }
          .toggle-btn.reject.active { background: #ef4444; color: white; border-color: #991b1b; }
          .toggle-btn.exclude { background: #f3f4f6; color: #6b7280; }
          .toggle-btn.exclude.active { background: #9ca3af; color: white; border-color: #4b5563; }
          .variant-block.excluded { opacity: 0.5; }
          .field-row { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; }
          .field-row label { font-weight: 500; min-width: 80px; }
          .field-row input { flex: 1; }
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
            {products.map((p, i) => (
              <a
                class="dot"
                href={`/review/${hash}/${i}`}
                style={`background:${AUDIT_COLORS[p.audit_status]};${i === idx ? "border:2px solid #000;" : ""}`}
                title={p.name}
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

        {allDone && (
          <div class="done-banner">All products reviewed! Server will shut down automatically.</div>
        )}

        {reanalyzing && (
          <div class="reanalyze-banner">Re-analysis complete. Review the new variants below.</div>
        )}

        <div class="layout">
          <div class="image-panel">
            <svg viewBox={`0 0 ${imgW} ${imgH}`} style="width:100%;height:auto">
              <image href={`/image/${hash}`} width={imgW} height={imgH} />
              {product.variants.flatMap((v, vi) => {
                const color = STATUS_COLORS[v.status];
                return v.images.map(([x1, y1, x2, y2], imgIdx) => (
                  <g class={`bbox-group-${vi}`}>
                    <rect
                      x={x1}
                      y={y1}
                      width={x2 - x1}
                      height={y2 - y1}
                      fill="none"
                      stroke={color}
                      stroke-width={strokeWidth}
                      opacity="0.8"
                      data-variant-idx={vi}
                    />
                    <text x={x1} y={y1 - 5} fill={color} font-size="14" font-weight="bold">
                      {v.name}
                      {v.images.length > 1 ? ` [${imgIdx}]` : ""}
                    </text>
                  </g>
                ));
              })}
            </svg>
          </div>

          <div class="products-panel">
            <h2>
              #{idx} <StatusBadge status={product.audit_status} />
            </h2>

            <form method="post" action={`/review/${hash}/${idx}`} id="review-form">
              <div class="field-row">
                <label>Name</label>
                <input type="text" name="name" value={product.name} style="font-size:16px" />
              </div>
              <div class="field-row">
                <label>Price raw</label>
                <input type="text" name="price_raw" value={product.price_raw ?? ""} />
              </div>
              <div class="field-row">
                <label>Price KRW</label>
                <input
                  type="text"
                  name="price"
                  value={product.price !== null ? String(product.price) : ""}
                />
              </div>

              <h3>Variants</h3>
              {product.variants.map((v, vi) => (
                <div class="variant-block" data-variant-idx={vi}>
                  <div class="variant-row">
                    <div class="variant-swatch" style={`background:${STATUS_COLORS[v.status]}`} />
                    <span class="variant-name">{v.name}</span>
                    <span class="variant-imgs">{v.images.length} img</span>
                    <input
                      type="hidden"
                      name={`variant_status_${vi}`}
                      value={v.status}
                      id={`vs-${vi}`}
                    />
                    <button
                      type="button"
                      class={`toggle-btn approve${v.status === "approved" ? " active" : ""}`}
                      onclick={`toggleVariant(${vi}, 'approved')`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      class={`toggle-btn reject${v.status === "rejected" ? " active" : ""}`}
                      onclick={`toggleVariant(${vi}, 'rejected')`}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      class={`toggle-btn exclude${v.status === "excluded" ? " active" : ""}`}
                      onclick={`toggleVariant(${vi}, 'excluded')`}
                    >
                      Exclude
                    </button>
                  </div>
                  <div
                    class="bbox-list"
                    style="margin:2px 0 0 24px;display:flex;gap:4px;flex-wrap:wrap"
                  >
                    {v.images.map(([x1, y1, x2, y2], bi) => (
                      <span class="bbox-tag" id={`bbox-${vi}-${bi}`}>
                        <input
                          type="hidden"
                          name={`bbox_exclude_${vi}_${bi}`}
                          id={`be-${vi}-${bi}`}
                          value="0"
                        />
                        <span class="bbox-label">
                          [{x1},{y1},{x2},{y2}]
                        </span>
                        <button
                          type="button"
                          class="bbox-exclude-btn"
                          onclick={`toggleExcludeBbox(${vi}, ${bi})`}
                          title="Exclude this bbox"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              <div style="margin-top:12px">
                <label style="font-weight:500">Re-analysis guide</label>
                <input
                  type="text"
                  name="reanalyze_guide"
                  placeholder="Optional hint for Gemini re-analysis"
                  style="width:100%;margin-top:4px"
                />
              </div>

              <div style="margin-top:16px;display:flex;gap:8px">
                <button type="submit" class="btn-submit" id="submit-btn">
                  {hasRejected ? "Save & Re-analyze" : "Save & Next"}
                </button>
                <button
                  type="submit"
                  name="full_reanalyze"
                  value="1"
                  class="btn-submit"
                  style="background:#6366f1"
                >
                  Full Re-analyze
                </button>
              </div>
            </form>
          </div>
        </div>

        {raw(`<script>
          var statusColors = ${JSON.stringify(STATUS_COLORS)};
          var variantCount = ${product.variants.length};

          function toggleVariant(idx, status) {
            var input = document.getElementById('vs-' + idx);
            var current = input.value;
            input.value = (current === status) ? 'pending' : status;

            updateVariantUI(idx);
            updateSubmitButton();
          }

          function updateVariantUI(idx) {
            var input = document.getElementById('vs-' + idx);
            var status = input.value;
            var block = document.querySelector('[data-variant-idx="' + idx + '"].variant-block');
            if (!block) return;

            var swatch = block.querySelector('.variant-swatch');
            if (swatch) swatch.style.background = statusColors[status];

            // Dim the whole block when excluded
            block.className = 'variant-block' + (status === 'excluded' ? ' excluded' : '');

            var approveBtn = block.querySelector('.toggle-btn.approve');
            var rejectBtn = block.querySelector('.toggle-btn.reject');
            var excludeBtn = block.querySelector('.toggle-btn.exclude');
            approveBtn.className = 'toggle-btn approve' + (status === 'approved' ? ' active' : '');
            rejectBtn.className = 'toggle-btn reject' + (status === 'rejected' ? ' active' : '');
            excludeBtn.className = 'toggle-btn exclude' + (status === 'excluded' ? ' active' : '');

            // Update SVG bbox colors
            var bboxes = document.querySelectorAll('.bbox-group-' + idx);
            bboxes.forEach(function(g) {
              var rect = g.querySelector('rect');
              var text = g.querySelector('text');
              if (rect) rect.setAttribute('stroke', statusColors[status]);
              if (text) text.setAttribute('fill', statusColors[status]);
            });
          }

          function toggleExcludeBbox(vi, bi) {
            var input = document.getElementById('be-' + vi + '-' + bi);
            var tag = document.getElementById('bbox-' + vi + '-' + bi);
            var excluded = input.value === '0';
            input.value = excluded ? '1' : '0';
            tag.className = 'bbox-tag' + (excluded ? ' excluded' : '');

            // Update SVG: hide/show the corresponding bbox rect
            var groups = document.querySelectorAll('.bbox-group-' + vi);
            if (groups[bi]) {
              groups[bi].style.opacity = excluded ? '0.15' : '1';
            }
          }

          function updateSubmitButton() {
            var btn = document.getElementById('submit-btn');
            var anyRejected = false;
            for (var i = 0; i < variantCount; i++) {
              var input = document.getElementById('vs-' + i);
              if (input.value === 'rejected') { anyRejected = true; break; }
            }
            btn.textContent = anyRejected ? 'Save & Re-analyze' : 'Save & Next';
          }
        </script>`)}
      </body>
    </html>
  );
}

async function loadProducts(hash: string): Promise<BoothProduct[] | undefined> {
  try {
    return await readProducts(boothInfoPaths(hash).jsonl);
  } catch {
    return undefined;
  }
}

function writeProducts(hash: string, products: BoothProduct[]): Promise<void> {
  const jsonl = `${products.map((p) => JSON.stringify(p)).join("\n")}\n`;
  return writeFile(boothInfoPaths(hash).jsonl, jsonl, "utf8");
}

function isProductPending(p: BoothProduct): boolean {
  return p.variants.some((v) => v.status !== "approved");
}

function findNextPending(products: BoothProduct[], afterIdx: number): number {
  const next = products.findIndex((p, i) => i > afterIdx && isProductPending(p));
  if (next !== -1) return next;
  const first = products.findIndex((p) => isProductPending(p));
  return first !== -1 ? first : afterIdx;
}

function runValidationServer(hash: string, port = 3001): Promise<BoothProduct[]> {
  return new Promise((resolve) => {
    const app = new Hono();

    app.get("/", (c) => c.redirect(`/review/${hash}/0`));
    app.get("/review/:hash", (c) => c.redirect(`/review/${c.req.param("hash")}/0`));

    app.get("/review/:hash/:index", async (c) => {
      const reqHash = c.req.param("hash");
      const idx = Number(c.req.param("index"));
      const products = await loadProducts(reqHash);
      if (!products) return c.text("Analysis not found", 404);
      if (idx < 0 || idx >= products.length) return c.redirect(`/review/${reqHash}/0`);
      const reanalyzing = c.req.query("reanalyzed") === "1";
      return c.html(
        <ReviewPage hash={reqHash} idx={idx} products={products} reanalyzing={reanalyzing} />,
      );
    });

    app.post("/review/:hash/:index", async (c) => {
      const reqHash = c.req.param("hash");
      const idx = Number(c.req.param("index"));
      let products = await loadProducts(reqHash);
      if (!products) return c.text("Analysis not found", 404);

      const body = await c.req.parseBody();
      const name = String(body["name"] ?? products[idx]!.name);
      const priceRaw = String(body["price_raw"] ?? "") || null;
      const priceStr = String(body["price"] ?? "");
      const price = priceStr ? Number(priceStr) : null;

      const auditor = await getGitUser();
      const product = products[idx]!;

      const guide = String(body["reanalyze_guide"] ?? "") || undefined;
      const fullReanalyze = String(body["full_reanalyze"] ?? "") === "1";

      // Parse variant statuses and bbox exclusions
      const parsedVariants: { name: string; images: BBox[]; status: VariantStatus }[] = [];
      for (let vi = 0; vi < product.variants.length; vi++) {
        const v = product.variants[vi]!;
        const statusStr = String(body[`variant_status_${vi}`] ?? v.status);
        const status: VariantStatus =
          statusStr === "approved" || statusStr === "rejected" || statusStr === "excluded"
            ? statusStr
            : "pending";

        // Filter out excluded bboxes
        const images: BBox[] = v.images.filter(
          (_, bi) => String(body[`bbox_exclude_${vi}_${bi}`] ?? "0") !== "1",
        );

        parsedVariants.push({ name: v.name, images, status });
      }

      // Drop excluded variants entirely
      const updatedVariants = parsedVariants.filter((v) => v.status !== "excluded");

      const hasRejected = updatedVariants.some((v) => v.status === "rejected");

      if (hasRejected || fullReanalyze) {
        // Read the PNG for re-analysis
        const paths = boothInfoPaths(reqHash);
        const pngBuf = await readFile(paths.png);

        // Load meta for coord conversion
        let meta: BoothImageMeta;
        try {
          meta = JSON.parse(await readFile(paths.meta, "utf8")) as BoothImageMeta;
        } catch {
          const metadata = await sharp(pngBuf).metadata();
          meta = { url: "", width: metadata.width!, height: metadata.height!, sha256: reqHash };
        }

        // Collect rejected variant bboxes (empty for full re-analyze)
        const reanalyzeRegions: ReanalyzeRegion[] = fullReanalyze
          ? []
          : updatedVariants
              .filter((v) => v.status === "rejected")
              .map((v) => ({ bboxes: v.images }));

        // Run re-extraction
        const geminiResult = await runGeminiExtraction(pngBuf, reanalyzeRegions, guide);
        const newProducts = geminiToProducts(geminiResult, reqHash, meta);

        // Merge: keep approved variants, replace rest with new results
        const newVariants = newProducts.flatMap((p) => p.variants);
        const approvedVariants = fullReanalyze
          ? []
          : updatedVariants.filter((v) => v.status === "approved");
        const mergedVariants = [...approvedVariants, ...newVariants];

        const mergedAuditStatus = deriveProductAuditStatus(mergedVariants);

        products = products.map((p, i) => {
          if (i !== idx) return p;
          return {
            ...p,
            name,
            price,
            price_raw: priceRaw,
            variants: mergedVariants,
            auditor,
            audit_status: mergedAuditStatus,
            audit_timestamp: new Date().toISOString(),
          };
        });

        await writeProducts(reqHash, products);
        return c.redirect(`/review/${reqHash}/${idx}?reanalyzed=1`);
      }

      // No rejected — update and move on
      const auditStatus = deriveProductAuditStatus(updatedVariants);

      products = products.map((p, i) => {
        if (i !== idx) return p;
        return {
          ...p,
          name,
          price,
          price_raw: priceRaw,
          variants: updatedVariants,
          auditor,
          audit_status: auditStatus,
          audit_timestamp: new Date().toISOString(),
        };
      });

      await writeProducts(reqHash, products);

      // Check if all products are fully approved
      if (products.every((p) => p.variants.every((v) => v.status === "approved"))) {
        setTimeout(() => {
          server.close();
          resolve(products);
        }, 500);
        return c.redirect(`/review/${reqHash}/${idx}`);
      }

      return c.redirect(`/review/${reqHash}/${findNextPending(products, idx)}`);
    });

    app.get("/image/:hash", async (c) => {
      const imgHash = c.req.param("hash");
      const paths = boothInfoPaths(imgHash);

      // Serve from disk if available
      try {
        const buf = await readFile(paths.png);
        return c.body(buf, 200, {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        });
      } catch {
        // Not on disk — fetch from remote, convert to PNG, persist
      }

      try {
        const innerProducts = await readProducts(paths.jsonl);
        const url = innerProducts[0]?.image_url;
        if (!url) return c.text("No image URL in analysis data", 404);

        const resp = await fetch(url);
        if (!resp.ok) return c.text(`Failed to fetch image: ${resp.status}`, 502);
        const pngBuf = await sharp(Buffer.from(await resp.arrayBuffer()))
          .png()
          .toBuffer();

        await mkdir(paths.dir, { recursive: true });
        await writeFile(paths.png, pngBuf);

        return c.body(new Uint8Array(pngBuf), 200, {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        });
      } catch {
        return c.text("Image not found", 404);
      }
    });

    const server = serve({ fetch: app.fetch, port }, (info) => {
      console.log(`\nValidation server: http://localhost:${info.port}/review/${hash}/0`);
      console.log("Review all products to continue.\n");
    });
  });
}

export function boothInfoReview(hash: string): Task<BoothProduct[]> {
  return task("booth-info/review", function* () {
    // Auto-analyze if JSONL doesn't exist yet
    yield* work(async ($) => {
      const paths = boothInfoPaths(hash);
      let needsAnalysis = false;
      try {
        await readFile(paths.jsonl);
      } catch {
        needsAnalysis = true;
      }

      if (!needsAnalysis) return;

      $.description(`Reading image and metadata — ${hash.slice(0, 12)}…`);
      const pngBuf = await readFile(paths.png);

      let meta: BoothImageMeta;
      try {
        meta = JSON.parse(await readFile(paths.meta, "utf8")) as BoothImageMeta;
      } catch {
        const metadata = await sharp(pngBuf).metadata();
        meta = { url: "", width: metadata.width!, height: metadata.height!, sha256: hash };
      }

      $.description(`Extracting products (Gemini 2.5 Flash) — ${hash.slice(0, 12)}…`);
      const geminiResult = await runGeminiExtraction(pngBuf);
      const products = geminiToProducts(geminiResult, hash, meta);

      $.description(
        `Writing ${products.length} products → ${hash.slice(0, 4)}/${hash.slice(0, 12)}…`,
      );
      await mkdir(paths.dir, { recursive: true });
      const jsonl = `${products.map((p) => JSON.stringify(p)).join("\n")}\n`;
      await writeFile(paths.jsonl, jsonl, "utf8");
    });

    const validated = yield* work(async ($) => {
      $.description(`Waiting for human review — http://localhost:3001/review/${hash}`);
      return await runValidationServer(hash);
    });

    return Ok(validated) as OkType<BoothProduct[]>;
  });
}
