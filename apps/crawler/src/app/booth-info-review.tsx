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
import { boothInfoPaths, discoverReviewHash, readProducts } from "./booth-info-shared.ts";
import { runGeminiExtraction, geminiToProducts } from "./booth-info-analyze.ts";
import type { ReanalyzeRegion } from "./booth-info-analyze.ts";
import type { BoothImageMeta } from "./booth-info-shared.ts";
import { deriveProductAuditStatus, normalizeVariantImages } from "./booth-info-types.ts";
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

function AnalysisPendingPage({
  hash,
  idx,
  error,
}: {
  hash: string;
  idx: number;
  error: string | undefined;
}) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Analyzing image…</title>
        {!error && <meta http-equiv="refresh" content="2" />}
        <style>{`
          body { font-family: system-ui, sans-serif; max-width: 720px; margin: 80px auto; padding: 20px; }
          .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; }
          .hash { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #4b5563; }
          .err { color: #b91c1c; background: #fee2e2; border-radius: 6px; padding: 10px; }
          a { color: #2563eb; text-decoration: none; }
        `}</style>
      </head>
      <body>
        <div class="card">
          <h2>Analyzing next image…</h2>
          <p class="hash">{hash.slice(0, 12)}</p>
          {error ? (
            <div class="err">
              <p>Analysis failed:</p>
              <pre>{error}</pre>
              <p>
                <a href={`/review/${hash}/${idx}?retry=1`}>Retry analysis</a>
              </p>
            </div>
          ) : (
            <p>Please wait, this page will refresh automatically.</p>
          )}
        </div>
      </body>
    </html>
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
          <div class="done-banner">
            All products reviewed! Redirecting to the next image (or shutting down if none left).
          </div>
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
                      id={`rect-${vi}-${imgIdx}`}
                      x={x1}
                      y={y1}
                      width={x2 - x1}
                      height={y2 - y1}
                      fill="none"
                      stroke={color}
                      stroke-width={strokeWidth}
                      opacity="0.8"
                      data-variant-idx={vi}
                      data-bbox-idx={imgIdx}
                      data-role="bbox-rect"
                      style="cursor:move"
                    />
                    <text
                      id={`label-${vi}-${imgIdx}`}
                      x={x1}
                      y={y1 - 5}
                      fill={color}
                      font-size="14"
                      font-weight="bold"
                    >
                      {v.name}
                    </text>
                    <rect
                      id={`handle-${vi}-${imgIdx}-left`}
                      x={x1 - strokeWidth * 0.8}
                      y={y1}
                      width={strokeWidth * 1.6}
                      height={y2 - y1}
                      fill={color}
                      opacity="0.35"
                      data-variant-idx={vi}
                      data-bbox-idx={imgIdx}
                      data-role="bbox-handle"
                      data-edge="left"
                      style="cursor:ew-resize"
                    />
                    <rect
                      id={`handle-${vi}-${imgIdx}-right`}
                      x={x2 - strokeWidth * 0.8}
                      y={y1}
                      width={strokeWidth * 1.6}
                      height={y2 - y1}
                      fill={color}
                      opacity="0.35"
                      data-variant-idx={vi}
                      data-bbox-idx={imgIdx}
                      data-role="bbox-handle"
                      data-edge="right"
                      style="cursor:ew-resize"
                    />
                    <rect
                      id={`handle-${vi}-${imgIdx}-top`}
                      x={x1}
                      y={y1 - strokeWidth * 0.8}
                      width={x2 - x1}
                      height={strokeWidth * 1.6}
                      fill={color}
                      opacity="0.35"
                      data-variant-idx={vi}
                      data-bbox-idx={imgIdx}
                      data-role="bbox-handle"
                      data-edge="top"
                      style="cursor:ns-resize"
                    />
                    <rect
                      id={`handle-${vi}-${imgIdx}-bottom`}
                      x={x1}
                      y={y2 - strokeWidth * 0.8}
                      width={x2 - x1}
                      height={strokeWidth * 1.6}
                      fill={color}
                      opacity="0.35"
                      data-variant-idx={vi}
                      data-bbox-idx={imgIdx}
                      data-role="bbox-handle"
                      data-edge="bottom"
                      style="cursor:ns-resize"
                    />
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
                    <input
                      type="text"
                      name={`variant_name_${vi}`}
                      value={v.name}
                      class="variant-name"
                    />
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
                        <input
                          type="hidden"
                          name={`bbox_${vi}_${bi}_x1`}
                          id={`bx1-${vi}-${bi}`}
                          value={x1}
                        />
                        <input
                          type="hidden"
                          name={`bbox_${vi}_${bi}_y1`}
                          id={`by1-${vi}-${bi}`}
                          value={y1}
                        />
                        <input
                          type="hidden"
                          name={`bbox_${vi}_${bi}_x2`}
                          id={`bx2-${vi}-${bi}`}
                          value={x2}
                        />
                        <input
                          type="hidden"
                          name={`bbox_${vi}_${bi}_y2`}
                          id={`by2-${vi}-${bi}`}
                          value={y2}
                        />
                        <span class="bbox-label" id={`bbox-label-${vi}-${bi}`}>
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
                  name="full_reanalyze_scope"
                  value="item"
                  class="btn-submit"
                  style="background:#6366f1"
                >
                  Full Re-analyze (This Item)
                </button>
                <button
                  type="submit"
                  name="full_reanalyze_scope"
                  value="all"
                  class="btn-submit"
                  style="background:#7c3aed"
                >
                  Full Re-analyze (All Items)
                </button>
              </div>
            </form>
          </div>
        </div>

        {raw(`<script>
          var statusColors = ${JSON.stringify(STATUS_COLORS)};
          var variantCount = ${product.variants.length};
          var imageWidth = ${imgW};
          var imageHeight = ${imgH};
          var minBboxSize = 8;
          var activeDrag = null;

          function getSvg() {
            return document.querySelector('.image-panel svg');
          }

          function toSvgPoint(evt) {
            var svg = getSvg();
            if (!svg) return { x: 0, y: 0 };
            var pt = svg.createSVGPoint();
            pt.x = evt.clientX;
            pt.y = evt.clientY;
            var ctm = svg.getScreenCTM();
            if (!ctm) return { x: 0, y: 0 };
            var local = pt.matrixTransform(ctm.inverse());
            return { x: local.x, y: local.y };
          }

          function readCoord(id, fallback) {
            var el = document.getElementById(id);
            if (!el) return fallback;
            var n = Number(el.value);
            return Number.isFinite(n) ? n : fallback;
          }

          function writeCoord(id, value) {
            var el = document.getElementById(id);
            if (!el) return;
            el.value = String(value);
          }

          function getBbox(vi, bi) {
            return {
              x1: readCoord('bx1-' + vi + '-' + bi, 0),
              y1: readCoord('by1-' + vi + '-' + bi, 0),
              x2: readCoord('bx2-' + vi + '-' + bi, 0),
              y2: readCoord('by2-' + vi + '-' + bi, 0)
            };
          }

          function clamp(v, lo, hi) {
            return Math.max(lo, Math.min(hi, v));
          }

          function normalizeBbox(x1, y1, x2, y2) {
            var left = Math.min(x1, x2);
            var right = Math.max(x1, x2);
            var top = Math.min(y1, y2);
            var bottom = Math.max(y1, y2);

            left = clamp(left, 0, imageWidth);
            right = clamp(right, 0, imageWidth);
            top = clamp(top, 0, imageHeight);
            bottom = clamp(bottom, 0, imageHeight);

            if (right - left < minBboxSize) {
              if (left + minBboxSize <= imageWidth) right = left + minBboxSize;
              else left = right - minBboxSize;
            }
            if (bottom - top < minBboxSize) {
              if (top + minBboxSize <= imageHeight) bottom = top + minBboxSize;
              else top = bottom - minBboxSize;
            }

            return {
              x1: Math.round(left),
              y1: Math.round(top),
              x2: Math.round(right),
              y2: Math.round(bottom)
            };
          }

          function setBbox(vi, bi, x1, y1, x2, y2) {
            var b = normalizeBbox(x1, y1, x2, y2);
            writeCoord('bx1-' + vi + '-' + bi, b.x1);
            writeCoord('by1-' + vi + '-' + bi, b.y1);
            writeCoord('bx2-' + vi + '-' + bi, b.x2);
            writeCoord('by2-' + vi + '-' + bi, b.y2);
            refreshBboxVisual(vi, bi);
          }

          function refreshBboxVisual(vi, bi) {
            var b = getBbox(vi, bi);
            var rect = document.getElementById('rect-' + vi + '-' + bi);
            if (rect) {
              rect.setAttribute('x', String(b.x1));
              rect.setAttribute('y', String(b.y1));
              rect.setAttribute('width', String(b.x2 - b.x1));
              rect.setAttribute('height', String(b.y2 - b.y1));
            }

            var label = document.getElementById('label-' + vi + '-' + bi);
            if (label) {
              label.setAttribute('x', String(b.x1));
              label.setAttribute('y', String(b.y1 - 5));
            }

            var left = document.getElementById('handle-' + vi + '-' + bi + '-left');
            if (left) {
              left.setAttribute('x', String(b.x1 - 2));
              left.setAttribute('y', String(b.y1));
              left.setAttribute('width', '4');
              left.setAttribute('height', String(b.y2 - b.y1));
            }

            var right = document.getElementById('handle-' + vi + '-' + bi + '-right');
            if (right) {
              right.setAttribute('x', String(b.x2 - 2));
              right.setAttribute('y', String(b.y1));
              right.setAttribute('width', '4');
              right.setAttribute('height', String(b.y2 - b.y1));
            }

            var top = document.getElementById('handle-' + vi + '-' + bi + '-top');
            if (top) {
              top.setAttribute('x', String(b.x1));
              top.setAttribute('y', String(b.y1 - 2));
              top.setAttribute('width', String(b.x2 - b.x1));
              top.setAttribute('height', '4');
            }

            var bottom = document.getElementById('handle-' + vi + '-' + bi + '-bottom');
            if (bottom) {
              bottom.setAttribute('x', String(b.x1));
              bottom.setAttribute('y', String(b.y2 - 2));
              bottom.setAttribute('width', String(b.x2 - b.x1));
              bottom.setAttribute('height', '4');
            }

            var text = document.getElementById('bbox-label-' + vi + '-' + bi);
            if (text) text.textContent = '[' + b.x1 + ',' + b.y1 + ',' + b.x2 + ',' + b.y2 + ']';
          }

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
              var handles = g.querySelectorAll('[data-role="bbox-handle"]');
              if (rect) rect.setAttribute('stroke', statusColors[status]);
              if (text) text.setAttribute('fill', statusColors[status]);
              handles.forEach(function(h) { h.setAttribute('fill', statusColors[status]); });
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

          function onDragStart(evt) {
            var target = evt.target;
            if (!target) return;
            var role = target.getAttribute('data-role');
            if (role !== 'bbox-rect' && role !== 'bbox-handle') return;

            evt.preventDefault();
            var vi = Number(target.getAttribute('data-variant-idx'));
            var bi = Number(target.getAttribute('data-bbox-idx'));
            var mode = role === 'bbox-rect' ? 'move' : 'resize-edge';
            var edge = target.getAttribute('data-edge') || 'right';
            var start = toSvgPoint(evt);
            activeDrag = {
              vi: vi,
              bi: bi,
              mode: mode,
              edge: edge,
              startX: start.x,
              startY: start.y,
              bbox: getBbox(vi, bi)
            };
            window.addEventListener('mousemove', onDragMove);
            window.addEventListener('mouseup', onDragEnd);
          }

          function onDragMove(evt) {
            if (!activeDrag) return;
            evt.preventDefault();
            var p = toSvgPoint(evt);
            var dx = p.x - activeDrag.startX;
            var dy = p.y - activeDrag.startY;
            var b = activeDrag.bbox;

            if (activeDrag.mode === 'move') {
              var w = b.x2 - b.x1;
              var h = b.y2 - b.y1;
              var x1 = clamp(b.x1 + dx, 0, imageWidth - w);
              var y1 = clamp(b.y1 + dy, 0, imageHeight - h);
              setBbox(activeDrag.vi, activeDrag.bi, x1, y1, x1 + w, y1 + h);
              return;
            }

            if (activeDrag.edge === 'left') {
              setBbox(activeDrag.vi, activeDrag.bi, b.x1 + dx, b.y1, b.x2, b.y2);
            } else if (activeDrag.edge === 'right') {
              setBbox(activeDrag.vi, activeDrag.bi, b.x1, b.y1, b.x2 + dx, b.y2);
            } else if (activeDrag.edge === 'top') {
              setBbox(activeDrag.vi, activeDrag.bi, b.x1, b.y1 + dy, b.x2, b.y2);
            } else {
              setBbox(activeDrag.vi, activeDrag.bi, b.x1, b.y1, b.x2, b.y2 + dy);
            }
          }

          function onDragEnd() {
            activeDrag = null;
            window.removeEventListener('mousemove', onDragMove);
            window.removeEventListener('mouseup', onDragEnd);
          }

          (function initDragResize() {
            var svg = getSvg();
            if (!svg) return;
            svg.addEventListener('mousedown', onDragStart);
          })();
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

const analysisJobs = new Map<string, Promise<void>>();
const analysisErrors = new Map<string, string>();

async function analyzeHashIfNeeded(hash: string): Promise<void> {
  const paths = boothInfoPaths(hash);
  try {
    await readFile(paths.jsonl);
    return;
  } catch {
    // needs analysis
  }

  const pngBuf = await readFile(paths.png);

  let meta: BoothImageMeta;
  try {
    meta = JSON.parse(await readFile(paths.meta, "utf8")) as BoothImageMeta;
  } catch {
    const metadata = await sharp(pngBuf).metadata();
    meta = {
      url: "",
      width: metadata.width!,
      height: metadata.height!,
      sha256: hash,
      confidence: 1,
      reason: "",
    };
  }

  const geminiResult = await runGeminiExtraction(pngBuf);
  const products = geminiToProducts(geminiResult, hash, meta);

  await mkdir(paths.dir, { recursive: true });
  const jsonl = `${products.map((p) => JSON.stringify(p)).join("\n")}\n`;
  await writeFile(paths.jsonl, jsonl, "utf8");
}

function queueBackgroundAnalysis(hash: string): void {
  if (analysisJobs.has(hash)) return;
  analysisErrors.delete(hash);
  const job = (async () => {
    try {
      await analyzeHashIfNeeded(hash);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      analysisErrors.set(hash, msg);
    } finally {
      analysisJobs.delete(hash);
    }
  })();
  analysisJobs.set(hash, job);
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

    app.get("/", async (c) => {
      const nextHash = await discoverReviewHash();
      if (nextHash) queueBackgroundAnalysis(nextHash);
      return c.redirect(`/review/${nextHash ?? hash}/0`);
    });
    app.get("/review/:hash", (c) => c.redirect(`/review/${c.req.param("hash")}/0`));

    app.get("/review/:hash/:index", async (c) => {
      const reqHash = c.req.param("hash");
      const idx = Number(c.req.param("index"));
      if (c.req.query("retry") === "1") queueBackgroundAnalysis(reqHash);
      const products = await loadProducts(reqHash);
      if (!products) {
        queueBackgroundAnalysis(reqHash);
        return c.html(
          <AnalysisPendingPage hash={reqHash} idx={idx} error={analysisErrors.get(reqHash)} />,
        );
      }
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
      if (!products) {
        queueBackgroundAnalysis(reqHash);
        return c.redirect(`/review/${reqHash}/${idx}`);
      }

      const body = await c.req.parseBody();
      const name = String(body["name"] ?? products[idx]!.name);
      const priceRaw = String(body["price_raw"] ?? "") || null;
      const priceStr = String(body["price"] ?? "");
      const price = priceStr ? Number(priceStr) : null;

      const auditor = await getGitUser();
      const product = products[idx]!;

      const guide = String(body["reanalyze_guide"] ?? "") || undefined;
      const fullReanalyzeScopeRaw = String(body["full_reanalyze_scope"] ?? "");
      const fullReanalyzeScope: "none" | "item" | "all" =
        fullReanalyzeScopeRaw === "item" || fullReanalyzeScopeRaw === "all"
          ? fullReanalyzeScopeRaw
          : "none";
      const fullReanalyze = fullReanalyzeScope !== "none";

      // Parse variant statuses and bbox exclusions
      const parsedVariants: { name: string; images: BBox[]; status: VariantStatus }[] = [];
      const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, value));
      const minBoxSize = 8;
      for (let vi = 0; vi < product.variants.length; vi++) {
        const v = product.variants[vi]!;
        const nameStr = String(body[`variant_name_${vi}`] ?? v.name).trim();
        const variantName = nameStr.length > 0 ? nameStr : v.name;
        const statusStr = String(body[`variant_status_${vi}`] ?? v.status);
        const status: VariantStatus =
          statusStr === "approved" || statusStr === "rejected" || statusStr === "excluded"
            ? statusStr
            : "pending";

        // Filter out excluded bboxes and apply drag-resized coordinates
        const images: BBox[] = [];
        for (let bi = 0; bi < Math.min(1, v.images.length); bi++) {
          if (String(body[`bbox_exclude_${vi}_${bi}`] ?? "0") === "1") continue;
          const [ox1, oy1, ox2, oy2] = v.images[bi]!;
          const rx1 = Number(body[`bbox_${vi}_${bi}_x1`] ?? ox1);
          const ry1 = Number(body[`bbox_${vi}_${bi}_y1`] ?? oy1);
          const rx2 = Number(body[`bbox_${vi}_${bi}_x2`] ?? ox2);
          const ry2 = Number(body[`bbox_${vi}_${bi}_y2`] ?? oy2);

          let x1 = Number.isFinite(rx1) ? rx1 : ox1;
          let y1 = Number.isFinite(ry1) ? ry1 : oy1;
          let x2 = Number.isFinite(rx2) ? rx2 : ox2;
          let y2 = Number.isFinite(ry2) ? ry2 : oy2;

          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);
          const top = Math.min(y1, y2);
          const bottom = Math.max(y1, y2);

          x1 = clamp(left, 0, product.image_width);
          x2 = clamp(right, 0, product.image_width);
          y1 = clamp(top, 0, product.image_height);
          y2 = clamp(bottom, 0, product.image_height);

          if (x2 - x1 < minBoxSize) {
            x2 = clamp(x1 + minBoxSize, 0, product.image_width);
            x1 = clamp(x2 - minBoxSize, 0, product.image_width);
          }
          if (y2 - y1 < minBoxSize) {
            y2 = clamp(y1 + minBoxSize, 0, product.image_height);
            y1 = clamp(y2 - minBoxSize, 0, product.image_height);
          }

          images.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)]);
        }

        parsedVariants.push({
          name: variantName,
          images: [...normalizeVariantImages(images)],
          status,
        });
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
          meta = {
            url: "",
            width: metadata.width!,
            height: metadata.height!,
            sha256: reqHash,
            confidence: 1,
            reason: "",
          };
        }

        // Collect re-analysis regions:
        // - normal re-analyze: rejected variants only
        // - full re-analyze (item): current item's area only
        // - full re-analyze (all): whole image (no region constraints)
        const currentItemBboxes = updatedVariants.flatMap((v) => v.images);
        const reanalyzeRegions: ReanalyzeRegion[] =
          fullReanalyzeScope === "all"
            ? []
            : fullReanalyzeScope === "item"
              ? currentItemBboxes.length > 0
                ? [{ bboxes: currentItemBboxes }]
                : []
              : updatedVariants
                  .filter((v) => v.status === "rejected")
                  .map((v) => ({ bboxes: v.images }));

        // Run re-extraction
        const geminiResult = await runGeminiExtraction(pngBuf, reanalyzeRegions, guide);
        const newProducts = geminiToProducts(geminiResult, reqHash, meta);

        // Full re-analyze (all items): replace every item with new extraction.
        if (fullReanalyzeScope === "all") {
          products = newProducts;
          await writeProducts(reqHash, products);
          const nextIndex = products.length > 0 ? Math.min(idx, products.length - 1) : 0;
          return c.redirect(`/review/${reqHash}/${nextIndex}?reanalyzed=1`);
        }

        // Full re-analyze (this item): re-analyze only this item's group region and replace this item.
        if (fullReanalyzeScope === "item") {
          const targetBoxes = currentItemBboxes;
          const target = (() => {
            if (targetBoxes.length === 0) return undefined;
            const xs1 = targetBoxes.map((b) => b[0]);
            const ys1 = targetBoxes.map((b) => b[1]);
            const xs2 = targetBoxes.map((b) => b[2]);
            const ys2 = targetBoxes.map((b) => b[3]);
            return [
              Math.min(...xs1),
              Math.min(...ys1),
              Math.max(...xs2),
              Math.max(...ys2),
            ] as const;
          })();

          const intersectionArea = (
            a: readonly [number, number, number, number],
            b: readonly [number, number, number, number],
          ) => {
            const x1 = Math.max(a[0], b[0]);
            const y1 = Math.max(a[1], b[1]);
            const x2 = Math.min(a[2], b[2]);
            const y2 = Math.min(a[3], b[3]);
            return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
          };

          const extracted =
            target == undefined
              ? newProducts[0]
              : [...newProducts]
                  .map((p) => {
                    const pb = p.variants.flatMap((v) => v.images);
                    if (pb.length === 0) return { p, score: -1 };
                    const ps: readonly [number, number, number, number] = [
                      Math.min(...pb.map((b) => b[0])),
                      Math.min(...pb.map((b) => b[1])),
                      Math.max(...pb.map((b) => b[2])),
                      Math.max(...pb.map((b) => b[3])),
                    ];
                    return { p, score: intersectionArea(target, ps) };
                  })
                  .sort((a, b) => b.score - a.score)[0]?.p;

          if (extracted) {
            const nextAuditStatus = deriveProductAuditStatus(extracted.variants);
            products = products.map((p, i) => {
              if (i !== idx) return p;
              return {
                ...p,
                name: extracted.name,
                price: extracted.price,
                price_raw: extracted.price_raw,
                variants: extracted.variants,
                auditor,
                audit_status: nextAuditStatus,
                audit_timestamp: new Date().toISOString(),
              };
            });
            await writeProducts(reqHash, products);
          }
          return c.redirect(`/review/${reqHash}/${idx}?reanalyzed=1`);
        }

        // Merge: keep approved variants, replace rest with new results
        const newVariants = newProducts.flatMap((p) => p.variants);
        const approvedVariants = updatedVariants.filter((v) => v.status === "approved");
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
        const nextHash = await discoverReviewHash();
        if (nextHash && nextHash !== reqHash) {
          queueBackgroundAnalysis(nextHash);
          return c.redirect(`/review/${nextHash}/0`);
        }
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
      $.description(`Preparing analysis — ${hash.slice(0, 12)}…`);
      await analyzeHashIfNeeded(hash);
    });

    const validated = yield* work(async ($) => {
      $.description(`Waiting for human review — http://localhost:3001/review/${hash}`);
      return await runValidationServer(hash);
    });

    return Ok(validated) as OkType<BoothProduct[]>;
  });
}
