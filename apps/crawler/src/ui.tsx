import type {
  ProgressValue,
  TaskEntry,
  TaskEvent,
  TaskState,
  TaskStatus,
  WorkState,
} from "./app/types.ts";
import * as v from "valibot";
import { Box, Text, render, useInput, useStdin } from "ink";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Spinner from "ink-spinner";

interface PropertyMismatch {
  path: string;
  messages: string[];
}

function extractValibotMismatches(error: unknown): PropertyMismatch[] | undefined {
  if (!(error instanceof v.ValiError)) return undefined;

  const flattened = v.flatten(error.issues);
  const mismatches: PropertyMismatch[] = [];

  // Root-level errors
  if (flattened.root && flattened.root.length > 0) {
    mismatches.push({ path: "(root)", messages: flattened.root });
  }

  // Nested property errors
  if (flattened.nested) {
    for (const [path, messages] of Object.entries(flattened.nested)) {
      if (messages && messages.length > 0) {
        mismatches.push({ path, messages });
      }
    }
  }

  return mismatches.length > 0 ? mismatches : undefined;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof v.ValiError) {
    return `Validation failed (${error.issues.length} issue${error.issues.length === 1 ? "" : "s"})`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return error.stack;
  return undefined;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function formatProgress(progress: ProgressValue): string {
  if (progress === "indefinite") return "…";
  if (progress.kind === "count") return `${progress.value}`;
  return `${Math.round(progress.value * 100)}%`;
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
    case "skipped": {
      return <Text dimColor>–</Text>;
    }
    case "error": {
      return <Text color="red">✗</Text>;
    }
  }
}

function PropertyMismatchList({ mismatches }: { mismatches: PropertyMismatch[] }) {
  return (
    <Box flexDirection="column" marginLeft={4}>
      {mismatches.slice(0, 5).map((m, i) => (
        <Text key={i} dimColor>
          • <Text color="cyan">{m.path}</Text>: {m.messages[0]}
        </Text>
      ))}
      {mismatches.length > 5 ? (
        <Text dimColor> ... and {mismatches.length - 5} more</Text>
      ) : undefined}
    </Box>
  );
}

function WorkRow({ work, expanded }: { work: WorkState; expanded: boolean }) {
  const stack = expanded && work.error ? formatErrorStack(work.error) : undefined;
  const mismatches = work.error ? extractValibotMismatches(work.error) : undefined;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box gap={1}>
        <StatusIcon status={work.status} />
        <Text dimColor>{work.description ?? work.name}</Text>
        {work.status === "error" && work.error ? (
          <Text color="red">{formatErrorMessage(work.error)}</Text>
        ) : undefined}
      </Box>
      {mismatches && !expanded ? <PropertyMismatchList mismatches={mismatches} /> : undefined}
      {stack ? (
        <Box marginLeft={4}>
          <Text dimColor>{stack}</Text>
        </Box>
      ) : undefined}
    </Box>
  );
}

function workDotElement(w: WorkState): React.ReactNode {
  switch (w.status) {
    case "done": {
      return <Text color="green">●</Text>;
    }
    case "running": {
      return <Text color="yellow">○</Text>;
    }
    case "error": {
      return <Text color="red">●</Text>;
    }
    default: {
      return <Text dimColor>○</Text>;
    }
  }
}

function WorkDots({ works }: { works: WorkState[] }) {
  if (works.length === 0) return undefined;

  if (works.length >= 13) {
    const hiddenCount = works.length - 3;
    const tail = works.slice(-3);
    return (
      <Box gap={1} marginLeft={1}>
        <Text dimColor>{hiddenCount}</Text>
        {tail.map((w) => workDotElement(w))}
      </Box>
    );
  }

  return (
    <Box gap={1} marginLeft={1}>
      {works.map((w) => workDotElement(w))}
    </Box>
  );
}

function TaskRow({
  name,
  state,
  states,
  focused,
  expanded,
}: {
  name: string;
  state: TaskState;
  states: Map<string, TaskState>;
  focused: boolean;
  expanded: boolean;
}) {
  const stack = expanded && state.error ? formatErrorStack(state.error) : undefined;
  const mismatches = state.error ? extractValibotMismatches(state.error) : undefined;
  const duration =
    state.startedAt !== undefined && state.endedAt !== undefined
      ? state.endedAt - state.startedAt
      : undefined;
  const currentWork = state.works.findLast((w) => w.status === "running");

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{focused ? "▸" : " "}</Text>
        <StatusIcon status={state.status} />
        <Text bold={focused}>{name}</Text>
        <WorkDots works={state.works} />
        {duration !== undefined ? <Text dimColor>({formatDuration(duration)})</Text> : undefined}
        {state.status === "error" && state.error ? (
          <Text color="red">{formatErrorMessage(state.error)}</Text>
        ) : undefined}
      </Box>
      {currentWork?.description ? (
        <Box marginLeft={4} gap={1}>
          <Text dimColor>{currentWork.description}</Text>
          {currentWork.progress !== undefined ? (
            <Text dimColor>({formatProgress(currentWork.progress)})</Text>
          ) : undefined}
        </Box>
      ) : undefined}
      {mismatches && !expanded ? (
        <Box marginLeft={3}>
          <PropertyMismatchList mismatches={mismatches} />
        </Box>
      ) : undefined}
      {stack ? (
        <Box marginLeft={3}>
          <Text dimColor>{stack}</Text>
        </Box>
      ) : undefined}
      {state.children.length > 0 ? (
        <ChildrenView childNames={state.children} states={states} expanded={expanded} />
      ) : undefined}
      {expanded &&
        state.works.map((work, i) => (
          <WorkRow key={`${work.name}-${i}`} work={work} expanded={expanded} />
        ))}
    </Box>
  );
}

function CompletedSummary({
  doneEntries,
  skippedEntries,
  states,
  focused,
  expanded,
}: {
  doneEntries: TaskEntry[];
  skippedEntries: TaskEntry[];
  states: Map<string, TaskState>;
  focused: boolean;
  expanded: boolean;
}) {
  const parts: string[] = [];
  if (doneEntries.length > 0) parts.push(`${doneEntries.length} done`);
  if (skippedEntries.length > 0) parts.push(`${skippedEntries.length} skipped`);

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{focused ? "▸" : " "}</Text>
        <Text color="green">✓</Text>
        <Text bold={focused}>{parts.join(", ")}</Text>
      </Box>
      {expanded &&
        [...doneEntries, ...skippedEntries].map((entry) => {
          const state = states.get(entry.name);
          const isSkipped = state?.status === "skipped";
          const duration =
            state?.startedAt !== undefined && state?.endedAt !== undefined
              ? state.endedAt - state.startedAt
              : undefined;
          return (
            <Box key={entry.name} gap={1} marginLeft={2}>
              {isSkipped ? <Text dimColor>–</Text> : <Text color="green">✓</Text>}
              <Text dimColor>{entry.name}</Text>
              {duration !== undefined ? (
                <Text dimColor>({formatDuration(duration)})</Text>
              ) : undefined}
            </Box>
          );
        })}
    </Box>
  );
}

function ChildrenView({
  childNames,
  states,
  expanded,
}: {
  childNames: string[];
  states: Map<string, TaskState>;
  expanded: boolean;
}) {
  if (childNames.length === 0) return undefined;

  const children = childNames.map((name) => ({
    name,
    state: states.get(name),
  }));

  if (expanded) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        {children.map(({ name, state }) => {
          const duration =
            state?.startedAt !== undefined && state?.endedAt !== undefined
              ? state.endedAt - state.startedAt
              : undefined;
          const currentWork = state?.works.findLast((w) => w.status === "running");
          return (
            <Box key={name} flexDirection="column">
              <Box gap={1}>
                <StatusIcon status={state?.status ?? "pending"} />
                <Text dimColor>{name}</Text>
                {duration !== undefined ? (
                  <Text dimColor>({formatDuration(duration)})</Text>
                ) : undefined}
                {state?.status === "error" && state.error ? (
                  <Text color="red">{formatErrorMessage(state.error)}</Text>
                ) : undefined}
              </Box>
              {currentWork?.description ? (
                <Box marginLeft={4}>
                  <Text dimColor>{currentWork.description}</Text>
                </Box>
              ) : undefined}
            </Box>
          );
        })}
      </Box>
    );
  }

  // Collapsed: show running + error individually, summary for rest
  const running = children.filter((c) => c.state?.status === "running");
  const errored = children.filter((c) => c.state?.status === "error");
  const doneCount = children.filter((c) => c.state?.status === "done").length;
  const skippedCount = children.filter((c) => c.state?.status === "skipped").length;
  const pendingCount = children.filter((c) => !c.state || c.state.status === "pending").length;

  const completedParts: string[] = [];
  if (doneCount > 0) completedParts.push(`${doneCount} done`);
  if (skippedCount > 0) completedParts.push(`${skippedCount} skipped`);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {running.map(({ name, state }) => {
        const currentWork = state?.works.findLast((w) => w.status === "running");
        return (
          <Box key={name} gap={1}>
            <StatusIcon status="running" />
            <Text dimColor>{name}</Text>
            {currentWork?.description ? (
              <Text dimColor> — {currentWork.description}</Text>
            ) : undefined}
          </Box>
        );
      })}
      {errored.map(({ name, state }) => (
        <Box key={name} gap={1}>
          <StatusIcon status="error" />
          <Text dimColor>{name}</Text>
          {state?.error ? <Text color="red"> {formatErrorMessage(state.error)}</Text> : undefined}
        </Box>
      ))}
      {completedParts.length > 0 ? (
        <Box gap={1}>
          <Text color="green">✓</Text>
          <Text dimColor>{completedParts.join(", ")}</Text>
        </Box>
      ) : undefined}
      {pendingCount > 0 ? (
        <Box gap={1}>
          <Text dimColor>○</Text>
          <Text dimColor>{pendingCount} pending</Text>
        </Box>
      ) : undefined}
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
          let status: TaskStatus;
          if (event.result.ok === "skipped") {
            status = "skipped";
          } else if (event.result.ok) {
            status = "done";
          } else {
            status = "error";
          }
          update(event.name, (prev) => ({
            ...prev,
            status,
            error: event.result.ok === false ? event.result.error : undefined,
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
        case "workDescription": {
          update(event.task, (prev) => ({
            ...prev,
            works: prev.works.map((w, i) =>
              i === prev.works.length - 1 ? { ...w, description: event.description } : w,
            ),
          }));
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
            children: [...new Set([...prev.children, ...(event.children as string[])])],
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
  const sortedByStartTime = entries.toSorted((a, b) => {
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

  const { displayLength, doneEntries, skippedEntries, otherEntries, collapseCompleted } =
    useMemo(() => {
      const done: TaskEntry[] = [];
      const skipped: TaskEntry[] = [];
      const other: TaskEntry[] = [];
      for (const entry of sortedEntries) {
        const status = states.get(entry.name)?.status;
        if (status === "done") {
          done.push(entry);
        } else if (status === "skipped") {
          skipped.push(entry);
        } else {
          other.push(entry);
        }
      }
      const completedCount = done.length + skipped.length;
      const collapse = completedCount >= 10;
      return {
        displayLength: collapse ? 1 + other.length : sortedEntries.length,
        doneEntries: done,
        skippedEntries: skipped,
        otherEntries: other,
        collapseCompleted: collapse,
      };
    }, [sortedEntries, states]);

  const allDone = [...states.values()].every(
    (s) => s.status === "done" || s.status === "skipped" || s.status === "error",
  );
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
          setFocusedIndex((prev) => Math.min(displayLength - 1, prev + 1));
        }
        if (input === "e" || key.return) {
          // Toggle expand: if already expanded, collapse; otherwise expand focused
          setExpandedIndex((prev) => (prev === focusedIndex ? -1 : focusedIndex));
        }
        if (input === "q" || key.escape) {
          onExit();
        }
      },
      [onExit, focusedIndex, displayLength],
    ),
    { isActive: isRawModeSupported },
  );

  useEffect(() => {
    setFocusedIndex((prev) => Math.min(prev, Math.max(0, displayLength - 1)));
  }, [displayLength]);

  useEffect(() => {
    if (allDone && !hasErrors) {
      onExit();
    }
    if (allDone && hasErrors && !isRawModeSupported) {
      onExit();
    }
  }, [allDone, hasErrors, isRawModeSupported, onExit]);

  const subscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const entry of entries) {
      // Skip if already subscribed to this entry's events
      if (subscribedRef.current.has(entry.name)) continue;
      subscribedRef.current.add(entry.name);

      consumeEvents(
        entry.result.events,
        (name, fn) => {
          setStates((prev) => {
            const current = prev.get(name) ?? {
              status: "pending" as const,
              works: [] as WorkState[],
              children: [] as string[],
              dependencies: [] as string[],
            };
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
      {collapseCompleted ? (
        <>
          <CompletedSummary
            doneEntries={doneEntries}
            skippedEntries={skippedEntries}
            states={states}
            focused={focusedIndex === 0}
            expanded={expandedIndex === 0}
          />
          {otherEntries.map((entry, index) => {
            const displayIndex = index + 1;
            return (
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
                states={states}
                focused={displayIndex === focusedIndex}
                expanded={displayIndex === expandedIndex}
              />
            );
          })}
        </>
      ) : (
        sortedEntries.map((entry, index) => (
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
            states={states}
            focused={index === focusedIndex}
            expanded={index === expandedIndex}
          />
        ))
      )}
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
