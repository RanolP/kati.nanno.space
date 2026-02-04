import * as v from "valibot";

import { YN } from "./codes.ts";

/** KST LocalDateTime string -> Unix timestamp (ms). Returns null for invalid dates like "0000-00-00". */
export const KSTTimestamp = v.pipe(
  v.string(),
  v.transform((s): number | null => {
    if (s.startsWith("0000")) return null;
    const date = new Date(`${s.replace(" ", "T")}+09:00`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }),
);

/** 이미지 첨부 정보 */
export const ImageInfo = v.object({
  /** 이미지 ID */
  id: v.number(),
  /** 부모 테이블 키 (문자열 또는 숫자) */
  parent_table_key: v.union([v.string(), v.number()]),
  /** 원본 파일명 */
  original_name: v.string(),
  /** 이미지 URL */
  url: v.string(),
});

/** 페이지네이션 정보 */
export const PageInfo = v.object({
  /** 현재 페이지 */
  page: v.number(),
  /** 페이지당 행 수 */
  row_per_page: v.number(),
  /** 전체 건수 */
  total_count: v.number(),
  /** 최대 페이지 */
  max_page: v.number(),
  /** 검색 키워드 */
  keyword: v.string(),
  /** 카테고리 필터 */
  category: v.string(),
  /** 정렬 기준 */
  sort: v.string(),
  /** 기타 검색 조건 */
  search: v.record(v.string(), v.unknown()),
});

/** 행사 목록 항목 */
export const EventListItem = v.object({
  /** 행사 ID */
  id: v.number(),
  /** 회차 (0이면 특별 행사) */
  round: v.number(),
  /** 행사 유형 (MAIN 등) */
  event_type: v.string(),
  /** 행사명 */
  name: v.string(),
  /** 상태 코드 (E0100001=예정, E0100002=진행중, E0100003=종료) */
  status: v.string(),
  /** 장소 */
  place: v.string(),
  /** 시작일시 (Unix ms) */
  start_date: KSTTimestamp,
  /** 종료일시 (Unix ms) */
  end_date: KSTTimestamp,
  /** 표시용 날짜 문자열 */
  show_date: v.string(),
  /** 티켓 오픈일시 (Unix ms) */
  ticket_open_date: v.nullable(KSTTimestamp),
  /** 대표 이미지 ID */
  image: v.number(),
  /** 티켓 마감일시 (Unix ms) */
  ticket_close_date: v.nullable(KSTTimestamp),
  /** 티켓 날짜 안내 문구 */
  ticket_date_desc: v.nullable(v.string()),
  /** PC 티켓 배경 이미지 ID */
  ticket_bg_image_pc: v.number(),
  /** 모바일 티켓 배경 이미지 ID */
  ticket_bg_image_mo: v.number(),
  /** 행사 설명 */
  description: v.nullable(v.string()),
  /** 목록 노출 여부 */
  show_at_list: YN,
  /** 진행중 섹션 노출 여부 */
  show_at_ongoing: YN,
});
