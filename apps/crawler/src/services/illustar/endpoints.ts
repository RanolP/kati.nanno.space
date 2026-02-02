import * as v from "valibot";

import {
  BoothStatusSchema,
  BoothTypeSchema,
  DateTypeSchema,
  GoodsTypeSchema,
  YN,
  commaSeparated,
} from "./codes.ts";
import { defineIllustarEndpoint } from "./define.ts";

// --- 공용 스키마 ---

/** 이미지 첨부 정보 */
const ImageInfo = v.object({
  /** 이미지 ID */
  id: v.number(),
  /** 부모 테이블 키 */
  parent_table_key: v.string(),
  /** 원본 파일명 */
  original_name: v.string(),
  /** 이미지 URL */
  url: v.string(),
});

/** 페이지네이션 정보 */
const PageInfo = v.object({
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

// --- 행사 ---

/** 행사 목록 항목 */
const EventListItem = v.object({
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
  /** 시작일시 */
  start_date: v.string(),
  /** 종료일시 */
  end_date: v.string(),
  /** 표시용 날짜 문자열 */
  show_date: v.string(),
  /** 티켓 오픈일시 */
  ticket_open_date: v.nullable(v.string()),
  /** 대표 이미지 ID */
  image: v.number(),
  /** 티켓 마감일시 */
  ticket_close_date: v.nullable(v.string()),
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

/** GET /event/list — 전체 행사 목록 */
export const eventList = defineIllustarEndpoint({
  path: "/event/list",
  schema: v.object({
    eventInfo: v.array(EventListItem),
  }),
});

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

const EventDetailSchema = v.object({
  detail: EventDetail,
});

/** GET /event/info/detail/:id — 행사 상세 */
export const eventDetail = defineIllustarEndpoint({
  path: "/event/info/detail/:id",
  schema: EventDetailSchema,
});

// --- 일정 ---

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

// --- 서클 ---

/** 서클(동인 부스) 목록 항목 */
const CircleListItem = v.object({
  /** 서클 ID */
  id: v.number(),
  /** 부스 신청 ID */
  event_booth_application_id: v.number(),
  /** 행사 ID */
  event_id: v.number(),
  /** 부스 번호 */
  booth_no: v.string(),
  /** 부스 상태 */
  booth_status: BoothStatusSchema,
  /** 서클명 */
  booth_name: v.string(),
  /** 참가 요일 */
  date_type: DateTypeSchema,
  /** 부스 크기 */
  booth_type: BoothTypeSchema,
  /** 구역 유형 */
  zone_type: v.string(),
  /** 지역 코드 */
  user_region: v.string(),
  /** 인접 부스명 */
  near_booth: v.string(),
  /** 홈페이지 URL */
  homepage: v.string(),
  /** 소개글 */
  introduce: v.string(),
  /** 태그 */
  tag: commaSeparated(v.string()),
  /** 대표 이미지 ID */
  image: v.number(),
  /** 부스 크기 유형 */
  size_type: v.string(),
  /** 작품 복잡도 유형 */
  complexity_type: v.string(),
  /** 참가 경험 유형 */
  exp_type: v.string(),
  /** 판매자 닉네임 */
  user_nickname: v.string(),
  /** 판매 상품 유형 */
  goods_type: commaSeparated(GoodsTypeSchema),
  /** 장르 유형 */
  genre_type: v.string(),
  /** 대표 이미지 상세 */
  image_info: ImageInfo,
});

const CircleListSchema = v.object({
  /** 서클 목록 공개 설정 */
  eventDetailInfo: v.object({
    /** 서클 목록 공개 여부 */
    show_circle_list_yn: YN,
    /** 서클 목록 안내 문구 */
    circle_list_text: v.string(),
  }),
  pageInfo: v.intersect([PageInfo, v.object({ event_id: v.string() })]),
  list: v.array(CircleListItem),
});

/** GET /circle?event_id&page&row_per_page — 서클 목록 (페이지네이션) */
export const circleList = defineIllustarEndpoint<
  "/circle",
  { event_id: number; page: number; row_per_page: number },
  v.InferOutput<typeof CircleListSchema>
>({
  path: "/circle",
  schema: CircleListSchema,
});

// --- 공연/티켓 ---

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
  /** 시작일시 */
  start_date: v.string(),
  /** 종료일시 */
  end_date: v.string(),
  /** 표시용 날짜 */
  show_date: v.string(),
  /** 썸네일 이미지 URL */
  thumbnail_image_url: v.string(),
  /** 티켓 날짜 안내 문구 */
  ticket_date_desc: v.string(),
  /** 티켓 오픈일시 */
  ticket_open_date: v.string(),
  /** 티켓 마감일시 */
  ticket_close_date: v.string(),
  /** 서버 현재 시각 */
  now_date: v.string(),
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
