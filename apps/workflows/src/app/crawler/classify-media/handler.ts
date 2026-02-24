/* eslint-disable unicorn/filename-case */

import * as restate from "@restatedev/restate-sdk";
import { generateText } from "ai";
import * as v from "valibot";

import { createWorkflowGoogleModel } from "@/services/ai.ts";
import { extractPng } from "./extract-png.ts";
import {
  classifyMediaInputStandardSchema,
  classifyMediaResponseStandardSchema,
  classificationResultSchema,
} from "./schema.ts";
import type { ClassifyMediaResponse } from "./schema.ts";

export const classify_media = restate.handlers.handler(
  {
    input: restate.serde.schema(classifyMediaInputStandardSchema),
    output: restate.serde.schema(classifyMediaResponseStandardSchema),
  },
  async (_ctx, input): Promise<ClassifyMediaResponse> => {
    const response = await fetch(input.mediaUrl);
    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Media not found: ${input.mediaUrl}`,
          },
        };
      }
      throw new Error(`Failed to fetch media: ${response.status}`);
    }

    const body = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const pngResult = await extractPng(body, contentType);

    if (pngResult.isErr) return { ok: false, error: pngResult.error };
    const model = createWorkflowGoogleModel("gemini-2.5-pro");

    const system = `You are a strict multi-tag scorer for booth merchandise media.

Known tags and cues:
- booth_info: informational sheet/catalog/menu-like image with multiple products and readable prices.
- others: anything else (artwork, poster, unrelated photo, announcement, unclear signal, etc.).

Rules:
1) Always include known tags booth_info and others in targets.
2) confidence is float in [0,1].
3) If image lacks clear booth_info evidence (especially multiple products + readable prices), booth_info must be low.
4) Use tweet text only as weak context. Do not up-score booth_info if image evidence is missing.
5) Provide a brief reason in one sentence.

Return JSON only.`;

    const prompt = `Tweet text (weak context): ${input.tweetText ?? ""}`;

    const generated = await generateText({
      model,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: pngResult.value, mimeType: "image/png" },
            { type: "text", text: prompt },
          ],
        },
      ],
      temperature: 0,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 128 } },
      },
    });

    const parsed = v.safeParse(classificationResultSchema, JSON.parse(generated.text));
    if (!parsed.success) {
      throw new Error("Invalid classification response");
    }

    return {
      ok: true,
      data: {
        reason: parsed.output.reason.trim() || "No reason provided",
        targets: parsed.output.targets,
      },
    };
  },
);
