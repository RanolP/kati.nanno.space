import { useEffect, useMemo, useState } from "react";
import type { DuckDbConnector } from "@sqlrooms/duckdb";
import { ArrowUpDownIcon } from "lucide-react";
import { CircleCard, rowToCircle } from "./circle-card";
import type { Circle } from "./circle-card";
import { BoothInfoModal } from "./booth-info-modal";
import type { BoothInfo } from "./booth-info-modal";

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
      if (SORT_OPTIONS.some((opt) => opt.key === parsed.key)) {
        return parsed;
      }
    }
  } catch {
    // no-op
  }
  localStorage.removeItem(SORT_STORAGE_KEY);
  return { key: "booth_no", direction: "asc" };
}

function saveSortConfig(config: SortConfig) {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(config));
}

function normalizeStringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof (value as { toArray?: () => unknown[] }).toArray === "function") {
    return (value as { toArray: () => unknown[] }).toArray().map(String);
  }
  return [];
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

  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [selectedBoothInfos, setSelectedBoothInfos] = useState<BoothInfo[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    saveSortConfig(sortConfig);
  }, [sortConfig]);

  const sortedCircles = useMemo(() => {
    const sorted = [...circles].sort((a: Circle, b: Circle) => {
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

        const rows = result.toArray().map((row) => rowToCircle(row as Record<string, unknown>));

        setCircles(rows);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to load circles");
      } finally {
        setLoading(false);
      }
    };

    void fetchCircles();
  }, [connector, tablesLoaded]);

  const handleCircleSelect = async (circle: Circle) => {
    setSelectedCircle(circle);
    setModalError(null);
    setSelectedBoothInfos([]);

    if (circle.id === undefined) {
      setModalError("circle id가 없어 booth_info를 조회할 수 없습니다.");
      return;
    }

    setModalLoading(true);
    try {
      const result = await connector.query(`
        SELECT
          bi.booth_info_id,
          bi.witchform_urls,
          bi.tweet_ids,
          bi.witchform_url_count,
          bi.tweet_count
        FROM circle_booth_info cbi
        JOIN booth_info bi ON bi.booth_info_id = cbi.booth_info_id
        WHERE cbi.illustar_circle_id = ${circle.id}
        ORDER BY bi.booth_info_id
      `);

      const rows = result.toArray().map((row) => ({
        booth_info_id: String(row.booth_info_id),
        witchform_urls: normalizeStringArray(row.witchform_urls),
        tweet_ids: normalizeStringArray(row.tweet_ids),
        witchform_url_count: Number(row.witchform_url_count ?? 0),
        tweet_count: Number(row.tweet_count ?? 0),
      }));

      setSelectedBoothInfos(rows);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "booth_info 조회 실패");
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedCircle(null);
    setSelectedBoothInfos([]);
    setModalError(null);
  };

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
    <>
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
        <div className="flex flex-wrap justify-center gap-2">
          {sortedCircles.map((circle: Circle, i: number) => (
            <CircleCard key={circle.id ?? i} circle={circle} onSelect={handleCircleSelect} />
          ))}
        </div>
      </div>

      <BoothInfoModal
        circle={selectedCircle}
        boothInfos={selectedBoothInfos}
        loading={modalLoading}
        error={modalError}
        onClose={closeModal}
      />
    </>
  );
}
