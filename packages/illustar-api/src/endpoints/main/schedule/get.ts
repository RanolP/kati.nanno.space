import * as v from "valibot";

import { defineIllustarEndpoint } from "../../../define.ts";
import { ImageInfo } from "../../../schemas.ts";

/** 일정 항목 */
const ScheduleItem = v.object({
  /** 일정 ID */
  id: v.number(),
  /** 행사명 */
  event_name: v.string(),
  /** 행사 날짜 (YYYY-MM-DD) */
  event_date: v.string(),
  /** 장소 */
  event_location: v.string(),
  /** 설명 */
  event_desc: v.string(),
  /** 이미지 ID */
  image: v.number(),
  /** 이미지 상세 */
  image_info: ImageInfo,
});

/** GET /main/schedule — 메인 일정 목록 */
export const schedule = defineIllustarEndpoint({
  path: "/main/schedule",
  schema: v.object({
    scheduleList: v.array(ScheduleItem),
  }),
});
