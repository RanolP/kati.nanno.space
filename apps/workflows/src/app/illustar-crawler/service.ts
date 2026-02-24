import * as restate from "@restatedev/restate-sdk";

import { get_event_detail as fetch_event_detail } from "./get-event-detail/handler.ts";
import {
  getEventDetailInputStandardSchema,
  getEventDetailResponseStandardSchema,
} from "./get-event-detail/schema.ts";
import type { GetEventDetailResponse } from "./get-event-detail/schema.ts";
import { accumulate_ongoing_booth_info } from "./get-ongoing-booth-info/handler.ts";
import { loadOngoingBoothInfoJsonl } from "@/features/illustar/ongoing-booth-info-repository.ts";
import { illustarStore } from "./store.ts";

export const illustarCrawler = restate.service({
  name: "IllustarCrawler",
  handlers: {
    get_event_detail: restate.handlers.handler(
      {
        input: restate.serde.schema(getEventDetailInputStandardSchema),
        output: restate.serde.schema(getEventDetailResponseStandardSchema),
      },
      async (ctx, input): Promise<GetEventDetailResponse> => {
        const store = ctx.objectClient(illustarStore, String(input.eventId));
        if (input.renew !== true) {
          const persisted = await store.load_event_detail();
          if (persisted !== null) return { ok: true, data: persisted };
          return {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: `Persisted event detail not found: ${input.eventId}. retry with renew=true`,
            },
          };
        }

        const fetched = await fetch_event_detail(ctx, input);
        if (!fetched.ok) return fetched;

        await store.save_event_detail(fetched.data);
        return fetched;
      },
    ),
    load_ongoing_booth_info: restate.handlers.handler(
      {},
      async (ctx): Promise<string> =>
        ctx.run("pg-load-ongoing-booth-info", () => loadOngoingBoothInfoJsonl()),
    ),
    accumulate_ongoing_booth_info,
  },
});
