import * as v from "valibot";

import { defineIllustarEndpoint } from "../../../../../define.ts";

/** 행사 상세 정보 */
const EventDetail = v.object({
  /** 행사 ID */
  event_id: v.number(),
  /** 행사명 */
  event_name: v.string(),
  /** 표시용 날짜 */
  event_date: v.string(),
  /** 표시용 시간 */
  event_time: v.string(),
  /** 장소 */
  event_location: v.string(),
  /** 로고 이미지 ID */
  event_logo: v.number(),
  /** 요약 이미지 1 ID */
  event_summary_image_1: v.number(),
  /** 요약 이미지 2 ID */
  event_summary_image_2: v.number(),
  /** 요약 이미지 3 ID */
  event_summary_image_3: v.number(),
  /** 주의사항 (HTML) */
  event_caution: v.string(),
});

/** GET /event/info/detail/:id — 행사 상세 */
export const eventDetail = defineIllustarEndpoint({
  path: "/event/info/detail/:id",
  schema: v.object({
    detail: EventDetail,
  }),
});
