import { useState } from "react";
import type { DbSchemaNode } from "@sqlrooms/duckdb";
import { TableSchemaTree } from "@sqlrooms/schema-tree";
import { TableIcon } from "lucide-react";
import { useRoomStore } from "../lib/store";

function findTableNode(nodes: DbSchemaNode[], tableName: string): DbSchemaNode | undefined {
  for (const node of nodes) {
    if (node.object.type === "table" && node.object.name === tableName) {
      return node;
    }
    if (node.children) {
      const found = findTableNode(node.children, tableName);
      if (found) return found;
    }
  }
  return undefined;
}

export function DataSourcesPanel() {
  const tables = useRoomStore((state) => state.db.tables);
  const schemaTrees = useRoomStore((state) => state.db.schemaTrees);
  const [selectedTable, setSelectedTable] = useState<string | undefined>();

  const tableNode =
    selectedTable && schemaTrees ? findTableNode(schemaTrees, selectedTable) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 p-2">
        {tables.map((t) => (
          <button
            key={t.table.table}
            type="button"
            onClick={() => setSelectedTable(t.table.table)}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
              selectedTable === t.table.table ? "bg-muted" : ""
            }`}
          >
            <TableIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t.table.table}</span>
          </button>
        ))}
      </div>

      {tableNode?.children && tableNode.children.length > 0 && (
        <div className="mt-auto border-t p-2">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Schema</div>
          <TableSchemaTree schemaTrees={tableNode.children} skipSingleDatabaseOrSchema />
        </div>
      )}
    </div>
  );
}
