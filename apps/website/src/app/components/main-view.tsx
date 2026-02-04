import { useSql } from "@sqlrooms/duckdb";
import { useRoomStore } from "../lib/store";

export function MainView() {
  const eventsReady = useRoomStore((state) => state.db.findTableByName("events"));

  const { data, isLoading, error } = useSql<{
    count: number;
  }>({
    query: `SELECT COUNT(*)::int AS count FROM events`,
    enabled: Boolean(eventsReady),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-destructive">Error: {error.message}</div>
      </div>
    );
  }

  const row = data?.toArray()[0];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">KATI Data Explorer</h1>
      <p className="text-muted-foreground">Total events: {row?.count?.toLocaleString()}</p>
      <p className="text-muted-foreground text-sm">
        Use the sidebar to explore available data tables.
      </p>
    </div>
  );
}
