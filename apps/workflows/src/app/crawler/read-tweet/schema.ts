import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

export const readTweetInputSchema = v.object({
  tweetId: v.pipe(v.string(), v.minLength(1)),
});

export const readTweetDataSchema = v.object({
  id: v.string(),
  userName: v.string(),
  fullText: v.string(),
  createdAt: v.string(),
  conversationId: v.string(),
  mediaUrls: v.array(v.string()),
  urls: v.array(v.string()),
});

const readTweetErrorSchema = v.object({
  code: v.picklist(["NOT_FOUND"]),
  message: v.string(),
});

export const readTweetResponseSchema = v.variant("ok", [
  v.object({
    ok: v.literal(true),
    data: readTweetDataSchema,
  }),
  v.object({
    ok: v.literal(false),
    error: readTweetErrorSchema,
  }),
]);

export type ReadTweetResponse = v.InferOutput<typeof readTweetResponseSchema>;
export type ReadTweetData = v.InferOutput<typeof readTweetDataSchema>;

export const readTweetInputStandardSchema = {
  ...readTweetInputSchema,
  "~standard": {
    ...readTweetInputSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(readTweetInputSchema),
    },
  },
};

export const readTweetResponseStandardSchema = {
  ...readTweetResponseSchema,
  "~standard": {
    ...readTweetResponseSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(readTweetResponseSchema),
    },
  },
};
