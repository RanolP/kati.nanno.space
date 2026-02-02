import type { ActionResult } from "../features/action/index.ts";

export type { ActionEvent } from "../features/action/index.ts";

export interface ActionEntry {
  readonly name: string;
  readonly result: ActionResult<unknown>;
}

export type ActionStatus = "pending" | "running" | "done" | "error";

export interface ActionState {
  status: ActionStatus;
  message?: string | undefined;
}
