/* eslint-disable unicorn/filename-case */

import * as restate from "@restatedev/restate-sdk";

import { runTwitterApi } from "@/features/gateway/twitter.ts";
import { loadReadTweetData, saveReadTweetData } from "@/features/twitter/read-tweet-repository.ts";
import { hasStatusCode } from "@/services/rettiwt/utils.ts";
import { readTweetInputStandardSchema, readTweetResponseStandardSchema } from "./schema.ts";
import type { ReadTweetResponse } from "./schema.ts";

export const read_tweet = restate.handlers.handler(
  {
    input: restate.serde.schema(readTweetInputStandardSchema),
    output: restate.serde.schema(readTweetResponseStandardSchema),
  },
  async (ctx, input): Promise<ReadTweetResponse> => {
    const cached = await ctx.run("pg-load-read-tweet", () => loadReadTweetData(input.tweetId));
    if (cached !== null) {
      return { ok: true, data: cached };
    }

    const fetched = await runTwitterApi(
      ctx,
      "twitter-read-tweet",
      async (client): Promise<ReadTweetResponse> => {
        let tweet: Awaited<ReturnType<typeof client.tweet.details>>;
        try {
          tweet = await client.tweet.details(input.tweetId);
        } catch (error) {
          if (hasStatusCode(error, 404))
            return {
              ok: false,
              error: { code: "NOT_FOUND", message: `Tweet not found: ${input.tweetId}` },
            };

          throw error;
        }

        if (tweet === undefined)
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: `Tweet not found: ${input.tweetId}` },
          };

        return {
          ok: true,
          data: {
            id: tweet.id,
            userName: tweet.tweetBy.userName,
            fullText: tweet.fullText,
            createdAt: tweet.createdAt,
            conversationId: tweet.conversationId,
            mediaUrls: (tweet.media ?? [])
              .map((media) => media.url)
              .filter((url): url is string => url !== undefined),
            urls: tweet.entities.urls.filter((url): url is string => url !== undefined),
          },
        };
      },
    );

    if (fetched.ok) {
      await ctx.run("pg-save-read-tweet", () => saveReadTweetData(input.tweetId, fetched.data));
    }

    return fetched;
  },
);
