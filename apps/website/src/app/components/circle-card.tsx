import type { KeyboardEvent } from "react";
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

  const idRaw = row.id;
  if (typeof idRaw === "number") {
    circle.id = idRaw;
  } else if (typeof idRaw === "bigint") {
    circle.id = Number(idRaw);
  } else if (typeof idRaw === "string" && /^\d+$/.test(idRaw)) {
    circle.id = Number(idRaw);
  }

  const eventIdRaw = row.event_id;
  if (typeof eventIdRaw === "number") {
    circle.event_id = eventIdRaw;
  } else if (typeof eventIdRaw === "bigint") {
    circle.event_id = Number(eventIdRaw);
  } else if (typeof eventIdRaw === "string" && /^\d+$/.test(eventIdRaw)) {
    circle.event_id = Number(eventIdRaw);
  }
  if (row.booth_type != null) circle.booth_type = String(row.booth_type);
  if (row.date_type != null) circle.date_type = String(row.date_type);
  if (row.user_nickname != null) circle.user_nickname = String(row.user_nickname);
  if (row.homepage != null) circle.homepage = String(row.homepage);
  if (row.introduce != null) circle.introduce = String(row.introduce);
  if (row.tag) {
    // DuckDB may return arrays in different formats
    const tagArray = Array.isArray(row.tag)
      ? row.tag
      : typeof (row.tag as { toArray?: () => unknown[] }).toArray === "function"
        ? (row.tag as { toArray: () => unknown[] }).toArray()
        : [];
    if (tagArray.length > 0) circle.tag = tagArray.map(String);
  }
  circle.image_info_url = row.image_info_url != null ? String(row.image_info_url) : null;

  return circle;
}

export function CircleCard({
  circle,
  onSelect,
}: {
  circle: Circle;
  onSelect?: (circle: Circle) => void;
}) {
  const hasImage = circle.image_info_url && circle.image_info_url.length > 0;
  const selectable = onSelect != undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(circle);
    }
  };

  return (
    <div
      className={`flex min-w-[400px] max-w-[450px] flex-1 overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow ${
        selectable
          ? "cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
          : ""
      }`}
      onClick={selectable ? () => onSelect?.(circle) : undefined}
      onKeyDown={handleKeyDown}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      {/* Left: Image or Fallback */}
      <div className="aspect-square w-32 shrink-0 overflow-hidden bg-muted">
        {hasImage ? (
          <img
            src={circle.image_info_url!}
            alt={circle.booth_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground/40">
            <ImageOffIcon className="h-8 w-8" />
            <span className="text-xs">미등록</span>
          </div>
        )}
      </div>

      {/* Right: Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        {/* Row 1: Title + Booth */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate font-semibold leading-tight">
            {circle.booth_name}
          </h3>
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
            <MapPinIcon className="h-3.5 w-3.5" />
            {circle.booth_no}
          </span>
        </div>

        {/* Row 2: Nickname + Description */}
        <div className="text-sm text-muted-foreground">
          {circle.user_nickname && (
            <span className="flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{circle.user_nickname}</span>
            </span>
          )}
          {circle.introduce && <p className="mt-0.5 line-clamp-1 text-xs">{circle.introduce}</p>}
        </div>

        {/* Row 3: Day + Booth Type */}
        <div className="flex flex-wrap items-center gap-1">
          {circle.date_type && DATE_TYPE_LABELS[circle.date_type] && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {DATE_TYPE_LABELS[circle.date_type]}
            </span>
          )}
          {circle.booth_type && BOOTH_TYPE_LABELS[circle.booth_type] && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              {BOOTH_TYPE_LABELS[circle.booth_type]}
            </span>
          )}
        </div>

        {/* Row 4: Tags + Homepage */}
        <div className="mt-auto flex flex-wrap items-center gap-1">
          {circle.tag &&
            circle.tag.map((t) => (
              <span
                key={t}
                className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                #{t.replace(/^#/, "")}
              </span>
            ))}
          {circle.homepage && (
            <a
              href={
                circle.homepage.startsWith("http") ? circle.homepage : `https://${circle.homepage}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-0.5 text-xs text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
