import * as v from "valibot";

import { defineIllustarEndpoint } from "../../define.ts";
import { KSTTimestamp, PageInfo } from "../../schemas.ts";

/** 공연(콘서트/티켓) 목록 항목 */
const ConcertListItem = v.object({
  /** 공연 ID (문자열 해시) */
  id: v.string(),
  /** 공연명 */
  name: v.string(),
  /** 상태 코드 */
  status: v.string(),
  /** 장소 */
  place: v.string(),
  /** 시작일시 (Unix ms) */
  start_date: KSTTimestamp,
  /** 종료일시 (Unix ms) */
  end_date: KSTTimestamp,
  /** 표시용 날짜 */
  show_date: v.string(),
  /** 썸네일 이미지 URL */
  thumbnail_image_url: v.string(),
  /** 티켓 날짜 안내 문구 */
  ticket_date_desc: v.string(),
  /** 티켓 오픈일시 (Unix ms) */
  ticket_open_date: KSTTimestamp,
  /** 티켓 마감일시 (Unix ms) */
  ticket_close_date: KSTTimestamp,
  /** 서버 현재 시각 (Unix ms) */
  now_date: KSTTimestamp,
});

const ConcertListSchema = v.object({
  pageInfo: PageInfo,
  list: v.array(ConcertListItem),
});

/** GET /concert?page&row_per_page — 공연 목록 (페이지네이션) */
export const concertList = defineIllustarEndpoint<
  "/concert",
  { page: number; row_per_page: number },
  v.InferOutput<typeof ConcertListSchema>
>({
  path: "/concert",
  schema: ConcertListSchema,
});
