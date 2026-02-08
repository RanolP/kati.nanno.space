import * as v from "valibot";

import { defineIllustarEndpoint } from "../../../define.ts";
import { EventListItem } from "../../../schemas.ts";

/** GET /event/list — 전체 행사 목록 */
export const eventList = defineIllustarEndpoint({
  path: "/event/list",
  schema: v.object({
    eventInfo: v.array(EventListItem),
  }),
});
