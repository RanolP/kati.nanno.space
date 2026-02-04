import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import duckdbWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?worker";

interface DuckDBContextValue {
  db: AsyncDuckDB | undefined;
  conn: AsyncDuckDBConnection | undefined;
  loading: boolean;
  error: Error | undefined;
  tables: string[];
  runQuery: (sql: string) => Promise<QueryResult>;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

const DuckDBContext = createContext<DuckDBContextValue | undefined>(undefined);

const PARQUET_TABLES = [
  { name: "circles", url: "/data/circles.parquet" },
  { name: "concerts", url: "/data/concerts.parquet" },
  { name: "events", url: "/data/events.parquet" },
  { name: "ongoing_booth_info", url: "/data/ongoing_booth_info.parquet" },
  { name: "schedule", url: "/data/schedule.parquet" },
];

export function DuckDBProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<AsyncDuckDB>();
  const [conn, setConn] = useState<AsyncDuckDBConnection>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [tables, setTables] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const duckdb = await import("@duckdb/duckdb-wasm");

        const worker = new duckdbWorker();
        const logger = new duckdb.ConsoleLogger();
        const database = new duckdb.AsyncDuckDB(logger, worker);

        await database.instantiate(duckdbWasm);

        if (cancelled) {
          await database.terminate();
          return;
        }

        const connection = await database.connect();

        // Register parquet files as tables
        const loadedTables: string[] = [];
        for (const table of PARQUET_TABLES) {
          try {
            const response = await fetch(table.url);
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              await database.registerFileBuffer(`${table.name}.parquet`, new Uint8Array(buffer));
              await connection.query(
                `CREATE TABLE ${table.name} AS SELECT * FROM read_parquet('${table.name}.parquet')`,
              );
              loadedTables.push(table.name);
            }
          } catch {
            console.warn(`Failed to load table: ${table.name}`);
          }
        }

        if (cancelled) {
          await database.terminate();
          return;
        }

        setDb(database);
        setConn(connection);
        setTables(loadedTables);
        setLoading(false);
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError : new Error(String(caughtError)));
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const runQuery = useCallback(
    async (sql: string): Promise<QueryResult> => {
      if (!conn) {
        throw new Error("Database not initialized");
      }

      const result = await conn.query(sql);
      const columns = result.schema.fields.map((f) => f.name);
      const rows: unknown[][] = [];

      for (const row of result) {
        const rowData: unknown[] = [];
        for (const col of columns) {
          rowData.push(row[col]);
        }
        rows.push(rowData);
      }

      return {
        columns,
        rows,
        rowCount: result.numRows,
      };
    },
    [conn],
  );

  const value = useMemo(
    () => ({ db, conn, loading, error, tables, runQuery }),
    [db, conn, loading, error, tables, runQuery],
  );

  return <DuckDBContext.Provider value={value}>{children}</DuckDBContext.Provider>;
}

export function useDuckDB() {
  const context = useContext(DuckDBContext);
  if (!context) {
    throw new Error("useDuckDB must be used within a DuckDBProvider");
  }
  return context;
}
