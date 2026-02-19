import { useEffect, useMemo, useState } from "react";
import type { DuckDbConnector } from "@sqlrooms/duckdb";
import { QueryDataTable } from "@sqlrooms/data-table";
import { LayoutGridIcon, TableIcon } from "lucide-react";
import { CircleCard, isCircleLikeData, rowToCircle } from "./circle-card";
import type { Circle } from "./circle-card";
import { BoothInfoModal } from "./booth-info-modal";
import type { BoothInfo } from "./booth-info-modal";

type ResultViewMode = "table" | "cards";

interface QueryResultViewProps {
  query: string;
  connector: DuckDbConnector;
  height: number;
}

function normalizeStringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof (value as { toArray?: () => unknown[] }).toArray === "function") {
    return (value as { toArray: () => unknown[] }).toArray().map(String);
  }
  return [];
}

export function QueryResultView({ query, connector, height }: QueryResultViewProps) {
  const [viewMode, setViewMode] = useState<ResultViewMode>("table");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [selectedBoothInfos, setSelectedBoothInfos] = useState<BoothInfo[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isCircleData = useMemo(() => isCircleLikeData(columns), [columns]);

  useEffect(() => {
    if (isCircleData && data.length > 0) {
      setViewMode("cards");
    } else {
      setViewMode("table");
    }
  }, [isCircleData, data.length]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await connector.query(query);
        const rows = result.toArray().map((row) => {
          const obj: Record<string, unknown> = {};
          for (const key of Object.keys(row)) {
            obj[key] = row[key];
          }
          return obj;
        });
        setData(rows);
        setColumns(result.schema.fields.map((f) => f.name));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Query failed");
        setData([]);
        setColumns([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [query, connector]);

  const circles = useMemo<Circle[]>(() => {
    if (!isCircleData) return [];
    return data.map((row) => rowToCircle(row));
  }, [data, isCircleData]);

  const handleCircleSelect = async (circle: Circle) => {
    setSelectedCircle(circle);
    setModalError(null);
    setSelectedBoothInfos([]);

    if (circle.id === undefined) {
      setModalError(
        "id 컬럼이 없어 booth_info를 조회할 수 없습니다. SELECT에 circles.id를 포함해 주세요.",
      );
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
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        {isCircleData && (
          <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1">
            <span className="text-xs text-muted-foreground">{data.length} rows</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                  viewMode === "table"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <TableIcon className="h-3 w-3" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                  viewMode === "cards"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <LayoutGridIcon className="h-3 w-3" />
                Cards
              </button>
            </div>
          </div>
        )}

        <div
          className="flex-1 overflow-auto"
          style={{ height: isCircleData ? height - 32 : height }}
        >
          {viewMode === "cards" && isCircleData ? (
            <div className="flex flex-wrap justify-center gap-2 p-3">
              {circles.map((circle, i) => (
                <CircleCard key={circle.id ?? i} circle={circle} onSelect={handleCircleSelect} />
              ))}
            </div>
          ) : (
            <QueryDataTable className="h-full" fontSize="text-xs" query={query} />
          )}
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
