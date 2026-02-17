export type AuditStatus = "pending" | "approved" | "rejected" | "corrected";

export type VariantStatus = "pending" | "approved" | "rejected" | "excluded";

/** Pixel bounding box: [x1, y1, x2, y2] (top-left to bottom-right corners). */
export type BBox = readonly [x1: number, y1: number, x2: number, y2: number];

export interface ProductVariant {
  readonly name: string;
  readonly images: readonly BBox[];
  readonly status: VariantStatus;
}

export interface BoothProduct {
  readonly image_sha256: string;
  readonly image_url: string;
  readonly image_width: number;
  readonly image_height: number;
  readonly product_index: number;
  readonly name: string;
  readonly price: number | null;
  readonly price_raw: string | null;
  readonly variants: readonly ProductVariant[];
  readonly auditor: string | null;
  readonly audit_status: AuditStatus;
  readonly audit_errors: readonly string[];
  readonly audit_timestamp: string | null;
  readonly pipeline_version: string;
  readonly created_at: string;
}

export const PIPELINE_VERSION = "0.4.0";

/** Enforce one bounding box per variant (keep the first if multiple are present). */
export function normalizeVariantImages(images: readonly BBox[]): readonly BBox[] {
  if (images.length <= 1) return images;
  return [images[0]!];
}

/** Derive product-level audit status from variant statuses. */
export function deriveProductAuditStatus(variants: readonly ProductVariant[]): AuditStatus {
  if (variants.length === 0) return "pending";
  if (variants.every((v) => v.status === "approved")) return "approved";
  return "pending";
}
