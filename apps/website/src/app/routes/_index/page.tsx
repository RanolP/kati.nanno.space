import { useEffect, useState } from "react";
import type { Route } from "./+types/page";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "KATI - SQL Shell" },
    { name: "description", content: "Query Korean subculture event data with SQL" },
  ];
}

export default function Home() {
  const [SqlShellClient, setSqlShellClient] = useState<React.ComponentType>();

  useEffect(() => {
    void import("../../components/sql-shell.client").then((m) => {
      setSqlShellClient(() => m.SqlShellClient);
      return m;
    });
  }, []);

  return (
    <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>KATI</h1>
      <p style={{ marginBottom: "1.5rem", color: "#666" }}>
        Query Korean subculture event data using DuckDB SQL. Runs entirely in your browser.
      </p>
      {SqlShellClient ? <SqlShellClient /> : <div>Loading SQL Shell...</div>}
    </main>
  );
}
