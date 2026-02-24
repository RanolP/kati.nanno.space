import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

const targetConfidenceSchema = v.object({
  confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

export const classificationResultSchema = v.object({
  reason: v.string(),
  targets: v.objectWithRest(
    {
      booth_info: targetConfidenceSchema,
      others: targetConfidenceSchema,
    },
    targetConfidenceSchema,
  ),
});

const classificationErrorSchema = v.object({
  code: v.picklist(["NOT_FOUND", "UNSUPPORTED_IMAGE_CODEC", "VIDEO_FORMAT_UNSUPPORTED"]),
  message: v.string(),
});

export const classifyMediaInputSchema = v.object({
  mediaUrl: v.pipe(v.string(), v.url()),
  tweetText: v.optional(v.string()),
});

export const classifyMediaResponseSchema = v.variant("ok", [
  v.object({
    ok: v.literal(true),
    data: classificationResultSchema,
  }),
  v.object({
    ok: v.literal(false),
    error: classificationErrorSchema,
  }),
]);

export type ClassificationResult = v.InferOutput<typeof classificationResultSchema>;
export type ClassificationError = v.InferOutput<typeof classificationErrorSchema>;
export type ClassifyMediaInput = v.InferOutput<typeof classifyMediaInputSchema>;
export type ClassifyMediaResponse = v.InferOutput<typeof classifyMediaResponseSchema>;

export const classifyMediaInputStandardSchema = {
  ...classifyMediaInputSchema,
  "~standard": {
    ...classifyMediaInputSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(classifyMediaInputSchema),
    },
  },
};

export const classifyMediaResponseStandardSchema = {
  ...classifyMediaResponseSchema,
  "~standard": {
    ...classifyMediaResponseSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(classifyMediaResponseSchema),
    },
  },
};
