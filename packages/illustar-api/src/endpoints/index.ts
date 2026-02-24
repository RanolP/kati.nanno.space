export { circleDetail } from "./circle/[id]/get.ts";
export { circleList } from "./circle/get.ts";
export { concertList } from "./concert/get.ts";
export { eventDetail } from "./event/info/detail/[id]/get.ts";
export { eventList } from "./event/list/get.ts";
export { ongoingBoothInfo } from "./main/ongoing-booth-info/get.ts";
export { schedule } from "./main/schedule/get.ts";

import { circleDetail } from "./circle/[id]/get.ts";
import { circleList } from "./circle/get.ts";
import { concertList } from "./concert/get.ts";
import { eventDetail } from "./event/info/detail/[id]/get.ts";
import { eventList } from "./event/list/get.ts";
import { ongoingBoothInfo } from "./main/ongoing-booth-info/get.ts";
import { schedule } from "./main/schedule/get.ts";

export const endpoints = {
  circleDetail,
  circleList,
  concertList,
  eventDetail,
  eventList,
  ongoingBoothInfo,
  schedule,
};
