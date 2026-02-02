import type { ActionResult } from "../features/action/index.ts";

export type { ActionEvent } from "../features/action/index.ts";

export interface ActionEntry {
  readonly name: string;
  readonly result: ActionResult<unknown>;
}

export type ActionStatus = "pending" | "running" | "done" | "error";

export interface StepState {
  name: string;
  status: ActionStatus;
  error?: unknown;
}

export interface ActionState {
  status: ActionStatus;
  steps: StepState[];
  error?: unknown;
}
