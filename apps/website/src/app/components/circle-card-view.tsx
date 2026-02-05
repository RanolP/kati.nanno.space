import { useEffect, useMemo, useState } from "react";
import type { DuckDbConnector } from "@sqlrooms/duckdb";
import { ArrowUpDownIcon } from "lucide-react";
import { CircleCard, type Circle } from "./circle-card";

type SortKey = "booth_no" | "booth_name" | "user_nickname" | "date_type" | "booth_type";
type SortDirection = "asc" | "desc";

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "booth_no", label: "부스 번호" },
  { key: "booth_name", label: "서클명" },
  { key: "user_nickname", label: "닉네임" },
  { key: "date_type", label: "참가일" },
  { key: "booth_type", label: "부스 타입" },
];

const SORT_STORAGE_KEY = "kati-circle-sort";

function loadSortConfig(): SortConfig {
  if (typeof window === "undefined") return { key: "booth_no", direction: "asc" };
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as SortConfig;
      // Validate sort key exists
      if (SORT_OPTIONS.some((opt) => opt.key === parsed.key)) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  // Remove invalid sort key from storage
  localStorage.removeItem(SORT_STORAGE_KEY);
  return { key: "booth_no", direction: "asc" };
}

function saveSortConfig(config: SortConfig) {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(config));
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
  const [sortConfig, setSortConfig] = useState<SortConfig>(loadSortConfig);

  useEffect(() => {
    saveSortConfig(sortConfig);
  }, [sortConfig]);

  const sortedCircles = useMemo(() => {
    const sorted = [...circles].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? "";
      const bVal = b[sortConfig.key] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal), "ko");
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [circles, sortConfig]);

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

  const handleSortChange = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{circles.length} circles</div>
        <div className="flex items-center gap-1">
          <ArrowUpDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSortChange(opt.key)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                sortConfig.key === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
              {sortConfig.key === opt.key && (sortConfig.direction === "asc" ? " ↑" : " ↓")}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {sortedCircles.map((circle, i) => (
          <CircleCard key={circle.id ?? i} circle={circle} />
        ))}
      </div>
    </div>
  );
}
