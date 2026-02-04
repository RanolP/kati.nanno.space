import { useEffect, useState } from "react";
import type { DuckDbConnector } from "@sqlrooms/duckdb";
import { ExternalLinkIcon, UserIcon, MapPinIcon, TagIcon } from "lucide-react";

interface Circle {
  id: number;
  event_id: number;
  booth_no: string;
  booth_name: string;
  booth_type: string;
  date_type: string;
  user_nickname: string;
  homepage: string;
  introduce: string;
  tag: string[];
  image_info_url: string | null;
}

const BOOTH_TYPE_LABELS: Record<string, string> = {
  B0200001: "XS",
  B0200002: "S",
  B0200003: "M",
  B0200004: "Wide M",
  B0200005: "Wide L",
  B0200006: "High-End",
  B0200007: "Flagship",
};

const DATE_TYPE_LABELS: Record<string, string> = {
  E0300001: "토",
  E0300002: "일",
  E0300003: "양일",
};

function CircleCard({ circle }: { circle: Circle }) {
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

export function CircleCardView({
  connector,
  tablesLoaded,
}: {
  connector: DuckDbConnector;
  tablesLoaded: boolean;
}) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tablesLoaded) return;

    const fetchCircles = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await connector.query(`
          SELECT
            id,
            event_id,
            booth_no,
            booth_name,
            booth_type,
            date_type,
            user_nickname,
            homepage,
            introduce,
            tag,
            image_info_url
          FROM circles
          ORDER BY booth_no
        `);

        const rows = result.toArray().map((row) => ({
          id: row.id,
          event_id: row.event_id,
          booth_no: row.booth_no,
          booth_name: row.booth_name,
          booth_type: row.booth_type,
          date_type: row.date_type,
          user_nickname: row.user_nickname,
          homepage: row.homepage,
          introduce: row.introduce,
          tag: row.tag ?? [],
          image_info_url: row.image_info_url,
        }));

        setCircles(rows);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to load circles");
      } finally {
        setLoading(false);
      }
    };

    fetchCircles();
  }, [connector, tablesLoaded]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading circles...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 text-sm text-muted-foreground">{circles.length} circles</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {circles.map((circle) => (
          <CircleCard key={circle.id} circle={circle} />
        ))}
      </div>
    </div>
  );
}
