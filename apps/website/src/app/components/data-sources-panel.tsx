import { useRoomStore } from "../lib/store";

export function DataSourcesPanel() {
  const tables = useRoomStore((state) => state.db.tables);

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold">Tables</h2>
      <ul className="space-y-2">
        {tables.map((table) => (
          <li key={table.tableName} className="rounded bg-muted p-2 text-sm">
            <div className="font-medium">{table.tableName}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
