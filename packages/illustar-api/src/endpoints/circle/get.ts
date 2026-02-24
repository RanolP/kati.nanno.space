import * as v from "valibot";

import {
  BoothStatusSchema,
  BoothTypeSchema,
  commaSeparated,
  DateTypeSchema,
  GoodsTypeSchema,
  YN,
} from "../../codes.ts";
import { defineIllustarEndpoint } from "../../define.ts";
import { ImageInfo, PageInfo } from "../../schemas.ts";

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
  image_info: v.nullable(ImageInfo),
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
