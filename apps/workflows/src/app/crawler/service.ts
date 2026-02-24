import * as restate from "@restatedev/restate-sdk";

import { classify_media } from "./classify-media/handler.ts";
import {
  readTweetInputStandardSchema,
  readTweetResponseStandardSchema,
} from "./read-tweet/schema.ts";
import { read_tweet } from "./read-tweet/handler.ts";

export const crawlerService = restate.service({
  name: "Crawler",
  handlers: {
    classify_media,
    read_tweet: restate.handlers.handler(
      {
        input: restate.serde.schema(readTweetInputStandardSchema),
        output: restate.serde.schema(readTweetResponseStandardSchema),
      },
      read_tweet,
    ),
  },
});
