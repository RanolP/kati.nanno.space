import { z } from "zod";

const restateIngressBaseUrl = process.env.CRAWLER_RESTATE_INGRESS ?? "http://127.0.0.1:8080";

const confidenceSchema = z.object({ confidence: z.number().min(0).max(1) });
const classifyMediaResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    data: z.object({
      reason: z.string(),
      targets: z.record(confidenceSchema),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(["NOT_FOUND", "UNSUPPORTED_IMAGE_CODEC", "VIDEO_FORMAT_UNSUPPORTED"]),
      message: z.string(),
    }),
  }),
]);

const readTweetResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    data: z.object({
      id: z.string(),
      userName: z.string(),
      fullText: z.string(),
      createdAt: z.string(),
      conversationId: z.string(),
      mediaUrls: z.array(z.string()),
      urls: z.array(z.string()),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.literal("NOT_FOUND"),
      message: z.string(),
    }),
  }),
]);

interface ClassifyMediaInput {
  readonly mediaUrl: string;
  readonly tweetText?: string;
}

interface ReadTweetInput {
  readonly tweetId: string;
}

export type ClassifyMediaResponse = z.infer<typeof classifyMediaResponseSchema>;
export type ReadTweetResponse = z.infer<typeof readTweetResponseSchema>;

export async function classifyMedia(input: ClassifyMediaInput): Promise<ClassifyMediaResponse> {
  return await invokeJson("/Crawler/classify_media", input, classifyMediaResponseSchema);
}

export async function readTweet(input: ReadTweetInput): Promise<ReadTweetResponse> {
  return await invokeJson("/Crawler/read_tweet", input, readTweetResponseSchema);
}

async function invokeJson<T>(path: string, payload: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${restateIngressBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Restate call failed (${response.status}) ${path}: ${bodyText}`);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Invalid Restate response for ${path}: ${parsed.error.message}`);
  }

  return parsed.data;
}
