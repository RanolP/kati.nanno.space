import { ExternalLinkIcon, UserIcon, MapPinIcon, TagIcon } from "lucide-react";

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
      {/* Image */}
      {hasImage && (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={circle.image_info_url!}
            alt={circle.booth_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{circle.booth_name}</h3>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPinIcon className="h-3 w-3" />
                {circle.booth_no}
              </span>
              {circle.date_type && DATE_TYPE_LABELS[circle.date_type] && (
                <span className="rounded bg-muted px-1.5 py-0.5">
                  {DATE_TYPE_LABELS[circle.date_type]}
                </span>
              )}
              {circle.booth_type && BOOTH_TYPE_LABELS[circle.booth_type] && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                  {BOOTH_TYPE_LABELS[circle.booth_type]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Nickname */}
        {circle.user_nickname && (
          <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
            <UserIcon className="h-3 w-3" />
            <span>{circle.user_nickname}</span>
          </div>
        )}

        {/* Description */}
        {circle.introduce && (
          <p className="mb-3 line-clamp-3 flex-1 text-xs text-muted-foreground">
            {circle.introduce}
          </p>
        )}

        {/* Tags */}
        {circle.tag && circle.tag.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {circle.tag.slice(0, 5).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                <TagIcon className="h-2.5 w-2.5" />
                {t.replace(/^#/, "")}
              </span>
            ))}
            {circle.tag.length > 5 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                +{circle.tag.length - 5}
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
            className="mt-auto flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            <span className="truncate">{circle.homepage}</span>
          </a>
        )}
      </div>
    </div>
  );
}
