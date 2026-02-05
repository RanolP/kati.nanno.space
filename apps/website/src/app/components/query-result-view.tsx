import { useEffect, useMemo, useState } from "react";
import type { DuckDbConnector } from "@sqlrooms/duckdb";
import { QueryDataTable } from "@sqlrooms/data-table";
import { LayoutGridIcon, TableIcon } from "lucide-react";
import { CircleCard, isCircleLikeData, rowToCircle, type Circle } from "./circle-card";

type ResultViewMode = "table" | "cards";

interface QueryResultViewProps {
  query: string;
  connector: DuckDbConnector;
  height: number;
}

export function QueryResultView({ query, connector, height }: QueryResultViewProps) {
  const [viewMode, setViewMode] = useState<ResultViewMode>("table");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCircleData = useMemo(() => isCircleLikeData(columns), [columns]);

  // Auto-switch to cards when circle data is detected
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Query failed");
        setData([]);
        setColumns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [query, connector]);

  const circles = useMemo<Circle[]>(() => {
    if (!isCircleData) return [];
    return data.map(rowToCircle);
  }, [data, isCircleData]);

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
    <div className="flex h-full flex-col">
      {/* View toggle - only show when circle data detected */}
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

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{ height: isCircleData ? height - 32 : height }}>
        {viewMode === "cards" && isCircleData ? (
          <div className="flex flex-wrap justify-center gap-2 p-3">
            {circles.map((circle, i) => (
              <CircleCard key={circle.id ?? i} circle={circle} />
            ))}
          </div>
        ) : (
          <QueryDataTable className="h-full" fontSize="text-xs" query={query} />
        )}
      </div>
    </div>
  );
}
