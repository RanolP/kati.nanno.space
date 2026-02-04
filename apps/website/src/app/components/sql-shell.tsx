import { useCallback, useState } from "react";
import { useDuckDB } from "../lib/duckdb/context";

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

const DEFAULT_QUERY = `-- Available tables: circles, concerts, events, ongoing_booth_info
-- Try: SELECT * FROM events LIMIT 10

SELECT * FROM events LIMIT 10`;

export function SqlShell() {
  const { loading, error, tables, runQuery } = useDuckDB();
  const [sql, setSql] = useState(DEFAULT_QUERY);
  const [result, setResult] = useState<QueryResult>();
  const [queryError, setQueryError] = useState<string>();
  const [executing, setExecuting] = useState(false);

  const handleExecute = useCallback(async () => {
    if (!sql.trim()) return;

    setExecuting(true);
    setQueryError(undefined);
    setResult(undefined);

    try {
      const queryResult = await runQuery(sql);
      setResult(queryResult);
    } catch (caughtError) {
      setQueryError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setExecuting(false);
    }
  }, [sql, runQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleExecute();
      }
    },
    [handleExecute],
  );

  if (loading) {
    return <div>Loading DuckDB and data...</div>;
  }

  if (error) {
    return <div>Error initializing DuckDB: {error.message}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {tables.length > 0 && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "#f0f7ff",
            border: "1px solid #cce5ff",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          <strong>Available tables:</strong> {tables.join(", ")}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter SQL query... (Ctrl+Enter to execute)"
          style={{
            width: "100%",
            minHeight: "120px",
            padding: "0.75rem",
            fontFamily: "monospace",
            fontSize: "14px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            resize: "vertical",
          }}
        />
        <button
          type="button"
          onClick={handleExecute}
          disabled={executing || !sql.trim()}
          style={{
            alignSelf: "flex-start",
            padding: "0.5rem 1rem",
            backgroundColor: executing ? "#ccc" : "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: executing ? "not-allowed" : "pointer",
          }}
        >
          {executing ? "Executing..." : "Execute (Ctrl+Enter)"}
        </button>
      </div>

      {queryError && (
        <div
          style={{
            padding: "0.75rem",
            backgroundColor: "#fee",
            border: "1px solid #fcc",
            borderRadius: "4px",
            color: "#c00",
            fontFamily: "monospace",
            fontSize: "14px",
            whiteSpace: "pre-wrap",
          }}
        >
          {queryError}
        </div>
      )}

      {result && (
        <div style={{ overflow: "auto" }}>
          <div style={{ marginBottom: "0.5rem", color: "#666" }}>
            {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "monospace",
              fontSize: "14px",
            }}
          >
            <thead>
              <tr>
                {result.columns.map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: "left",
                      padding: "0.5rem",
                      borderBottom: "2px solid #333",
                      backgroundColor: "#f5f5f5",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        padding: "0.5rem",
                        borderBottom: "1px solid #ddd",
                        maxWidth: "300px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={formatCell(cell)}
                    >
                      {formatCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
