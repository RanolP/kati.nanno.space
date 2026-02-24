import * as v from "valibot";

import { defineIllustarEndpoint } from "../../../define.ts";
import { EventListItem, ImageInfo } from "../../../schemas.ts";

/** 진행중 부스 정보 항목 (행사 + 티켓 배경 이미지 포함) */
const OngoingBoothInfoItem = v.object({
  ...EventListItem.entries,
  /** PC 티켓 배경 이미지 상세 */
  ticket_bg_image_pc_info: ImageInfo,
});

/** GET /main/ongoingBoothInfo — 진행중 부스 정보 */
export const ongoingBoothInfo = defineIllustarEndpoint({
  path: "/main/ongoingBoothInfo",
  schema: v.object({
    boothInfo: v.array(OngoingBoothInfoItem),
  }),
});
