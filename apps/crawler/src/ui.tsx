import type { TaskEntry, TaskEvent, TaskState, TaskStatus, WorkState } from "./app/types.ts";
import { Box, Text, render, useInput, useStdin } from "ink";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import Spinner from "ink-spinner";

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return error.stack;
  return undefined;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case "pending": {
      return <Text dimColor>○</Text>;
    }
    case "running": {
      return <Spinner type="dots" />;
    }
    case "done": {
      return <Text color="green">✓</Text>;
    }
    case "error": {
      return <Text color="red">✗</Text>;
    }
  }
}

function WorkRow({ work, expanded }: { work: WorkState; expanded: boolean }) {
  const stack = expanded && work.error ? formatErrorStack(work.error) : undefined;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box gap={1}>
        <StatusIcon status={work.status} />
        <Text dimColor>{work.description ?? work.name}</Text>
        {work.status === "error" && work.error ? (
          <Text color="red">{formatErrorMessage(work.error)}</Text>
        ) : undefined}
      </Box>
      {stack ? (
        <Box marginLeft={4}>
          <Text dimColor>{stack}</Text>
        </Box>
      ) : undefined}
    </Box>
  );
}

function TaskRow({
  name,
  state,
  focused,
  expanded,
}: {
  name: string;
  state: TaskState;
  focused: boolean;
  expanded: boolean;
}) {
  const stack = expanded && state.error ? formatErrorStack(state.error) : undefined;
  const duration =
    state.startedAt !== undefined && state.endedAt !== undefined
      ? state.endedAt - state.startedAt
      : undefined;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{focused ? "▸" : " "}</Text>
        <StatusIcon status={state.status} />
        <Text bold={focused}>{name}</Text>
        {duration !== undefined ? <Text dimColor>({formatDuration(duration)})</Text> : undefined}
        {state.status === "error" && state.error ? (
          <Text color="red">{formatErrorMessage(state.error)}</Text>
        ) : undefined}
      </Box>
      {stack ? (
        <Box marginLeft={3}>
          <Text dimColor>{stack}</Text>
        </Box>
      ) : undefined}
      {expanded &&
        state.works.map((work, i) => (
          <WorkRow key={`${work.name}-${i}`} work={work} expanded={expanded} />
        ))}
    </Box>
  );
}

function consumeEvents(
  events: AsyncIterable<TaskEvent>,
  update: (name: string, fn: (prev: TaskState) => TaskState) => void,
  addDependency: (task: string, dependsOn: string) => void,
): void {
  (async () => {
    for await (const event of events) {
      switch (event.kind) {
        case "taskStart": {
          update(event.name, (prev) => ({
            ...prev,
            status: "running",
            startedAt: event.timestamp,
          }));
          break;
        }
        case "taskEnd": {
          update(event.name, (prev) => ({
            ...prev,
            status: event.result.ok ? "done" : "error",
            error: event.result.ok ? undefined : event.result.error,
            endedAt: event.timestamp,
          }));
          break;
        }
        case "taskDependency": {
          addDependency(event.task, event.dependsOn);
          break;
        }
        case "workStart": {
          update(event.task, (prev) => {
            const newWork: WorkState = {
              name: event.task,
              status: "running" as const,
            };
            if (event.description !== undefined) {
              newWork.description = event.description;
            }
            return {
              ...prev,
              status: "running",
              works: [...prev.works, newWork],
            };
          });
          break;
        }
        case "workProgress": {
          update(event.task, (prev) => ({
            ...prev,
            works: prev.works.map((w, i) =>
              i === prev.works.length - 1 ? { ...w, progress: event.value } : w,
            ),
          }));
          break;
        }
        case "workEnd": {
          update(event.task, (prev) => ({
            ...prev,
            works: prev.works.map((w, i) =>
              i === prev.works.length - 1 ? { ...w, status: "done" as const } : w,
            ),
          }));
          break;
        }
        case "spawnStart": {
          update(event.parent, (prev) => ({
            ...prev,
            children: event.children as string[],
          }));
          break;
        }
        case "spawnEnd": {
          // Spawn end is informational; children handle their own state
          break;
        }
      }
    }
  })();
}

// Topological sort with start time as secondary sort key
function sortTasksByDependencies(
  entries: readonly TaskEntry[],
  states: Map<string, TaskState>,
): TaskEntry[] {
  const nameToEntry = new Map(entries.map((e) => [e.name, e]));
  const visited = new Set<string>();
  const result: TaskEntry[] = [];

  // Build dependency graph from states
  const dependencyGraph = new Map<string, Set<string>>();
  for (const entry of entries) {
    const state = states.get(entry.name);
    if (state) {
      dependencyGraph.set(entry.name, new Set(state.dependencies));
    } else {
      dependencyGraph.set(entry.name, new Set());
    }
  }

  // Topological sort with DFS
  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);

    const deps = dependencyGraph.get(name) ?? new Set();
    for (const dep of deps) {
      if (nameToEntry.has(dep)) {
        visit(dep);
      }
    }

    const entry = nameToEntry.get(name);
    if (entry) {
      result.push(entry);
    }
  }

  // Sort entries by start time first, then visit in that order
  const sortedByStartTime = [...entries].sort((a, b) => {
    const stateA = states.get(a.name);
    const stateB = states.get(b.name);
    const startA = stateA?.startedAt ?? Number.MAX_SAFE_INTEGER;
    const startB = stateB?.startedAt ?? Number.MAX_SAFE_INTEGER;
    return startA - startB;
  });

  for (const entry of sortedByStartTime) {
    visit(entry.name);
  }

  return result;
}

function App({ entries, onExit }: { entries: readonly TaskEntry[]; onExit: () => void }) {
  const { isRawModeSupported } = useStdin();

  const [states, setStates] = useState<Map<string, TaskState>>(() => {
    const map = new Map<string, TaskState>();
    for (const entry of entries) {
      map.set(entry.name, { status: "pending", works: [], children: [], dependencies: [] });
    }
    return map;
  });

  const [focusedIndex, setFocusedIndex] = useState(0);
  // Expanded index: -1 means none expanded, otherwise the index of expanded task
  const [expandedIndex, setExpandedIndex] = useState(-1);

  // Sort entries by dependencies and start time
  const sortedEntries = useMemo(() => sortTasksByDependencies(entries, states), [entries, states]);

  const allDone = [...states.values()].every((s) => s.status === "done" || s.status === "error");
  const hasErrors = [...states.values()].some((s) => s.status === "error");

  useInput(
    useCallback(
      (
        input: string,
        key: { escape: boolean; upArrow: boolean; downArrow: boolean; return: boolean },
      ) => {
        if (key.upArrow) {
          setFocusedIndex((prev) => Math.max(0, prev - 1));
        }
        if (key.downArrow) {
          setFocusedIndex((prev) => Math.min(sortedEntries.length - 1, prev + 1));
        }
        if (input === "e" || key.return) {
          // Toggle expand: if already expanded, collapse; otherwise expand focused
          setExpandedIndex((prev) => (prev === focusedIndex ? -1 : focusedIndex));
        }
        if (input === "q" || key.escape) {
          onExit();
        }
      },
      [onExit, focusedIndex, sortedEntries.length],
    ),
    { isActive: isRawModeSupported },
  );

  useEffect(() => {
    if (allDone && !hasErrors) {
      onExit();
    }
    if (allDone && hasErrors && !isRawModeSupported) {
      onExit();
    }
  }, [allDone, hasErrors, isRawModeSupported, onExit]);

  useEffect(() => {
    for (const entry of entries) {
      consumeEvents(
        entry.result.events,
        (name, fn) => {
          setStates((prev) => {
            const current = prev.get(name);
            if (!current) return prev;
            const next = new Map(prev);
            next.set(name, fn(current));
            return next;
          });
        },
        (task, dependsOn) => {
          setStates((prev) => {
            const current = prev.get(task);
            if (!current) return prev;
            if (current.dependencies.includes(dependsOn)) return prev;
            const next = new Map(prev);
            next.set(task, {
              ...current,
              dependencies: [...current.dependencies, dependsOn],
            });
            return next;
          });
        },
      );
    }
  }, [entries]);

  return (
    <Box flexDirection="column">
      {sortedEntries.map((entry, index) => (
        <TaskRow
          key={entry.name}
          name={entry.name}
          state={
            states.get(entry.name) ?? {
              status: "pending",
              works: [],
              children: [],
              dependencies: [],
            }
          }
          focused={index === focusedIndex}
          expanded={index === expandedIndex}
        />
      ))}
      {hasErrors && allDone && isRawModeSupported ? (
        <Text dimColor>
          <Text bold>↑↓</Text> navigate, <Text bold>Enter/e</Text> expand/collapse,{" "}
          <Text bold>q</Text> quit
        </Text>
      ) : undefined}
    </Box>
  );
}

export function renderTasks(entries: readonly TaskEntry[]): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const { unmount } = render(
      <App
        entries={entries}
        onExit={() => {
          if (resolved) return;
          resolved = true;
          unmount();
          resolve(true);
        }}
      />,
    );
  });
}
