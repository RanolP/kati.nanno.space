import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { WorkflowEnv } from "../shared/env.ts";

export function createWorkflowGoogleModel(model = "gemini-2.5-pro") {
  const apiKey = WorkflowEnv.AI_KEY_GEMINI;

  const google = createGoogleGenerativeAI({ apiKey });
  return google(model);
}
