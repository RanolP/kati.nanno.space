import type { DotItem, TaskState, WorkState } from "./types.ts";
import { statusDot } from "./icons.tsx";
import { Box, Text } from "ink";
import React from "react";

export function ProgressDots({
  works,
  childNames,
  states,
}: {
  works: WorkState[];
  childNames: string[];
  states: Map<string, TaskState>;
}) {
  const items: DotItem[] = [];

  // Works don't have endedAt — use index as implicit order (they're sequential)
  for (const w of works) {
    items.push({ status: w.status, endedAt: w.status === "done" ? 0 : undefined });
  }

  // Children have endedAt from their TaskState
  for (const name of childNames) {
    const s = states.get(name);
    items.push({ status: s?.status, endedAt: s?.endedAt });
  }

  if (items.length === 0) return undefined;

  // Sort: completed items by endedAt, then active items at the end
  const sorted = items.toSorted((a, b) => {
    if (a.endedAt !== undefined && b.endedAt !== undefined) return a.endedAt - b.endedAt;
    if (a.endedAt !== undefined) return -1;
    if (b.endedAt !== undefined) return 1;
    return 0;
  });

  if (sorted.length <= 16) {
    return (
      <Box gap={1} marginLeft={1}>
        {sorted.map((d, i) => (
          <React.Fragment key={`dot-${i}-${d.status ?? "pending"}-${d.endedAt ?? "active"}`}>
            {statusDot(d.status)}
          </React.Fragment>
        ))}
      </Box>
    );
  }

  // Text summary + last 3 dots
  const counts = { done: 0, skipped: 0, pending: 0, running: 0, error: 0 };
  for (const d of sorted) {
    counts[d.status ?? "pending"]++;
  }
  const parts: string[] = [];
  if (counts.done > 0) parts.push(`${counts.done} done`);
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`);
  if (counts.pending > 0) parts.push(`${counts.pending} pending`);

  const tail = sorted.slice(-3);
  return (
    <Box gap={1} marginLeft={1}>
      {parts.length > 0 ? <Text dimColor>{parts.join(", ")}</Text> : undefined}
      {tail.map((d, i) => (
        <React.Fragment key={`tail-dot-${i}-${d.status ?? "pending"}-${d.endedAt ?? "active"}`}>
          {statusDot(d.status)}
        </React.Fragment>
      ))}
    </Box>
  );
}
