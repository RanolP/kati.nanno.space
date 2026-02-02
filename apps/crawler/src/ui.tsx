import type { ActionEntry, ActionEvent, ActionState, ActionStatus } from "./app/types.ts";
import { Box, Text, render } from "ink";
import React, { useEffect, useState } from "react";

import Spinner from "ink-spinner";

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

function ActionRow({ name, state }: { name: string; state: ActionState }) {
  return (
    <Box gap={1}>
      <StatusIcon status={state.status} />
      <Text>{name}</Text>
      {state.message ? <Text dimColor>{state.message}</Text> : undefined}
    </Box>
  );
}

async function consumeEvents(
  name: string,
  events: AsyncIterable<ActionEvent>,
  update: (name: string, patch: Partial<ActionState>) => void,
): Promise<void> {
  for await (const event of events) {
    switch (event.kind) {
      case "action:start": {
        update(name, { status: "running", message: event.name });
        break;
      }
      case "action:progress": {
        update(name, { message: event.message });
        break;
      }
      case "action:done": {
        update(name, { message: event.name });
        break;
      }
      case "action:error": {
        update(name, { status: "error", message: String(event.error) });
        break;
      }
    }
  }
  update(name, { status: "done" });
}

function App({ entries }: { entries: readonly ActionEntry[] }) {
  const [states, setStates] = useState<Map<string, ActionState>>(() => {
    const map = new Map<string, ActionState>();
    for (const entry of entries) {
      map.set(entry.name, { status: "pending" });
    }
    return map;
  });

  useEffect(() => {
    for (const entry of entries) {
      consumeEvents(entry.name, entry.result.events, (name, patch) => {
        setStates((prev) => {
          const current = prev.get(name)!;
          const next = new Map(prev);
          next.set(name, { ...current, ...patch });
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
          state={states.get(entry.name) ?? { status: "pending" }}
        />
      ))}
    </Box>
  );
}

export function renderActions(entries: readonly ActionEntry[]) {
  return render(<App entries={entries} />);
}
