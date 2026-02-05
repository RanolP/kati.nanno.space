import { ExternalLinkIcon, UserIcon, MapPinIcon, ImageOffIcon } from "lucide-react";

export interface Circle {
  id?: number;
  event_id?: number;
  booth_no: string;
  booth_name: string;
  booth_type?: string;
  date_type?: string;
  user_nickname?: string;
  homepage?: string;
  introduce?: string;
  tag?: string[];
  image_info_url?: string | null;
}

export const BOOTH_TYPE_LABELS: Record<string, string> = {
  B0200001: "XS",
  B0200002: "S",
  B0200003: "M",
  B0200004: "Wide M",
  B0200005: "Wide L",
  B0200006: "High-End",
  B0200007: "Flagship",
};

export const DATE_TYPE_LABELS: Record<string, string> = {
  E0300001: "토",
  E0300002: "일",
  E0300003: "양일",
};

// Required columns to detect circle-like data
export const CIRCLE_REQUIRED_COLUMNS = ["booth_no", "booth_name"] as const;
export const CIRCLE_OPTIONAL_COLUMNS = [
  "booth_type",
  "date_type",
  "user_nickname",
  "homepage",
  "introduce",
  "tag",
  "image_info_url",
] as const;

export function isCircleLikeData(columns: string[]): boolean {
  const columnSet = new Set(columns.map((c) => c.toLowerCase()));
  return CIRCLE_REQUIRED_COLUMNS.every((col) => columnSet.has(col));
}

export function rowToCircle(row: Record<string, unknown>): Circle {
  const circle: Circle = {
    booth_no: String(row.booth_no ?? ""),
    booth_name: String(row.booth_name ?? ""),
  };

  if (typeof row.id === "number") circle.id = row.id;
  if (typeof row.event_id === "number") circle.event_id = row.event_id;
  if (row.booth_type != null) circle.booth_type = String(row.booth_type);
  if (row.date_type != null) circle.date_type = String(row.date_type);
  if (row.user_nickname != null) circle.user_nickname = String(row.user_nickname);
  if (row.homepage != null) circle.homepage = String(row.homepage);
  if (row.introduce != null) circle.introduce = String(row.introduce);
  if (Array.isArray(row.tag)) circle.tag = row.tag.map(String);
  circle.image_info_url = row.image_info_url != null ? String(row.image_info_url) : null;

  return circle;
}

export function CircleCard({ circle }: { circle: Circle }) {
  const hasImage = circle.image_info_url && circle.image_info_url.length > 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Image or Fallback */}
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        {hasImage ? (
          <img
            src={circle.image_info_url!}
            alt={circle.booth_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/50">
            <ImageOffIcon className="h-8 w-8" />
            <span className="text-xs">미등록</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* Title + Booth Info */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{circle.booth_name}</h3>
          <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <MapPinIcon className="h-3 w-3" />
            {circle.booth_no}
          </div>
        </div>

        {/* Meta row: nickname + badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {circle.user_nickname && (
            <span className="flex items-center gap-0.5">
              <UserIcon className="h-3 w-3" />
              {circle.user_nickname}
            </span>
          )}
          {circle.date_type && DATE_TYPE_LABELS[circle.date_type] && (
            <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
              {DATE_TYPE_LABELS[circle.date_type]}
            </span>
          )}
          {circle.booth_type && BOOTH_TYPE_LABELS[circle.booth_type] && (
            <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
              {BOOTH_TYPE_LABELS[circle.booth_type]}
            </span>
          )}
        </div>

        {/* Tags */}
        {circle.tag && circle.tag.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {circle.tag.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                #{t.replace(/^#/, "")}
              </span>
            ))}
            {circle.tag.length > 4 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                +{circle.tag.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Homepage Link */}
        {circle.homepage && (
          <a
            href={
              circle.homepage.startsWith("http") ? circle.homepage : `https://${circle.homepage}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            <span className="truncate">{circle.homepage}</span>
          </a>
        )}
      </div>
    </div>
  );
}
