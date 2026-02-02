import type {
  ActionEntry,
  ActionEvent,
  ActionState,
  ActionStatus,
  StepState,
} from "./app/types.ts";
import { Box, Text, render, useInput, useStdin } from "ink";
import React, { useCallback, useEffect, useState } from "react";

import Spinner from "ink-spinner";

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return error.stack;
  return undefined;
}

function StatusIcon({ status }: { status: ActionStatus }) {
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

function StepRow({ step, expanded }: { step: StepState; expanded: boolean }) {
  const stack = expanded && step.error ? formatErrorStack(step.error) : undefined;

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box gap={1}>
        <StatusIcon status={step.status} />
        <Text dimColor>{step.name}</Text>
        {step.status === "error" && step.error ? (
          <Text color="red">{formatErrorMessage(step.error)}</Text>
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

function ActionRow({
  name,
  state,
  expanded,
}: {
  name: string;
  state: ActionState;
  expanded: boolean;
}) {
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <StatusIcon status={state.status} />
        <Text>{name}</Text>
        {state.status === "error" && state.error ? (
          <Text color="red">{formatErrorMessage(state.error)}</Text>
        ) : undefined}
      </Box>
      {state.steps.map((step) => (
        <StepRow key={step.name} step={step} expanded={expanded} />
      ))}
    </Box>
  );
}

function consumeEvents(
  name: string,
  events: AsyncIterable<ActionEvent>,
  update: (name: string, fn: (prev: ActionState) => ActionState) => void,
): void {
  (async () => {
    for await (const event of events) {
      switch (event.kind) {
        case "action:start": {
          update(name, (prev) => ({
            ...prev,
            status: "running",
            steps: [...prev.steps, { name: event.name, status: "running" }],
          }));
          break;
        }
        case "action:done": {
          update(name, (prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.name === event.name ? { ...s, status: "done" as const } : s,
            ),
          }));
          break;
        }
        case "action:error": {
          update(name, (prev) => ({
            ...prev,
            status: "error",
            error: event.error,
            steps: prev.steps.map((s) =>
              s.name === event.name ? { ...s, status: "error" as const, error: event.error } : s,
            ),
          }));
          break;
        }
      }
    }
    // Stream ended without error — mark parent done if not already errored
    update(name, (prev) => (prev.status === "error" ? prev : { ...prev, status: "done" }));
  })();
}

function App({ entries, onExit }: { entries: readonly ActionEntry[]; onExit: () => void }) {
  const { isRawModeSupported } = useStdin();

  const [states, setStates] = useState<Map<string, ActionState>>(() => {
    const map = new Map<string, ActionState>();
    for (const entry of entries) {
      map.set(entry.name, { status: "pending", steps: [] });
    }
    return map;
  });

  const [expandedErrors, setExpandedErrors] = useState(false);

  const allDone = [...states.values()].every((s) => s.status === "done" || s.status === "error");
  const hasErrors = [...states.values()].some((s) => s.status === "error");

  useInput(
    useCallback(
      (input: string, key: { escape: boolean }) => {
        if (input === "e") {
          setExpandedErrors((prev) => !prev);
        }
        if (input === "q" || key.escape) {
          onExit();
        }
      },
      [onExit],
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
      consumeEvents(entry.name, entry.result.events, (name, fn) => {
        setStates((prev) => {
          const current = prev.get(name)!;
          const next = new Map(prev);
          next.set(name, fn(current));
          return next;
        });
      });
    }
  }, [entries]);

  return (
    <Box flexDirection="column">
      {entries.map((entry) => (
        <ActionRow
          key={entry.name}
          name={entry.name}
          state={states.get(entry.name) ?? { status: "pending", steps: [] }}
          expanded={expandedErrors}
        />
      ))}
      {hasErrors && allDone && isRawModeSupported ? (
        <Text dimColor>
          Press <Text bold>e</Text> to {expandedErrors ? "collapse" : "expand"} stack traces,{" "}
          <Text bold>q</Text> to quit
        </Text>
      ) : undefined}
    </Box>
  );
}

export function renderActions(entries: readonly ActionEntry[]): Promise<boolean> {
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
