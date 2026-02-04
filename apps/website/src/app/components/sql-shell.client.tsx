import { DuckDBProvider } from "../lib/duckdb/context";
import { SqlShell } from "./sql-shell";

export function SqlShellClient() {
  return (
    <DuckDBProvider>
      <SqlShell />
    </DuckDBProvider>
  );
}
