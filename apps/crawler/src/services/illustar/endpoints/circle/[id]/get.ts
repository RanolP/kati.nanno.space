import * as v from "valibot";

import {
  BoothStatusSchema,
  BoothTypeSchema,
  commaSeparated,
  DateTypeSchema,
  GoodsTypeSchema,
  YN,
} from "../../../codes.ts";
import { defineIllustarEndpoint } from "../../../define.ts";
import { ImageInfo, KSTTimestamp } from "../../../schemas.ts";

/** 서클(동인 부스) 상세 */
const CircleDetailItem = v.object({
  /** 서클 ID */
  id: v.number(),
  /** 부스 신청 ID */
  event_booth_application_id: v.number(),
  /** 행사 ID */
  event_id: v.number(),
  /** 사용자 ID */
  user_id: v.number(),
  /** UEBA ID */
  ueba_id: v.string(),
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
  /** 부스 등급 유형 */
  booth_grade_type: v.string(),
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
  /** 기타 */
  etc: v.string(),
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
  /** 부스 할인 금액 */
  booth_discount_amount: v.number(),
  /** 결제 기한 */
  pay_limit: KSTTimestamp,
  /** 생성일시 */
  created_at: KSTTimestamp,
  /** 수정일시 */
  updated_at: KSTTimestamp,
  /** 삭제 여부 */
  delete_yn: YN,
  /** 삭제일시 */
  deleted_at: v.nullable(KSTTimestamp),
  /** 판매 상품 이미지 목록 */
  goods_list: v.array(ImageInfo),
  /** 대표 이미지 상세 */
  image_info: v.nullable(ImageInfo),
});

const CircleDetailSchema = v.object({
  userBoothApplication: CircleDetailItem,
});

/** GET /circle/:id — 서클 상세 */
export const circleDetail = defineIllustarEndpoint({
  path: "/circle/:id",
  schema: CircleDetailSchema,
});
