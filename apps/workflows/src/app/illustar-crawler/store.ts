import * as restate from "@restatedev/restate-sdk";

import type { GetEventDetailData } from "./get-event-detail/schema.ts";

export const illustarStore = restate.object({
  name: "IllustarStore",
  handlers: {
    save_event_detail: restate.handlers.object.exclusive(
      async (ctx, input: GetEventDetailData): Promise<void> => {
        ctx.set("event-detail", input);
      },
    ),
    load_event_detail: restate.handlers.object.exclusive(
      async (ctx): Promise<GetEventDetailData | null> =>
        ctx.get<GetEventDetailData>("event-detail"),
    ),
  },
});
