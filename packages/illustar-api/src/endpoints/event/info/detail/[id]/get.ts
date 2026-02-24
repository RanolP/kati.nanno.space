import * as v from "valibot";

import { defineIllustarEndpoint } from "../../../../../define.ts";
import { ImageInfo } from "../../../../../schemas.ts";

const EventImageItem = v.object({
  id: v.number(),
  event_id: v.number(),
  category: v.string(),
  url: v.string(),
  delete_yn: v.picklist(["Y", "N"]),
  created_at: v.string(),
  updated_at: v.string(),
  deleted_at: v.nullable(v.string()),
});

const SponsorItem = v.object({
  id: v.number(),
  event_id: v.number(),
  sponsor_type: v.string(),
  sponsor_sort: v.number(),
  sponsor_name: v.string(),
  sponsor_image: v.number(),
  sponsor_desc: v.string(),
  image_info: ImageInfo,
});

const SpecialZoneItem = v.object({
  id: v.number(),
  event_id: v.number(),
  zone_sort: v.number(),
  zone_name: v.string(),
  zone_desc: v.string(),
  zone_image: v.number(),
  image_info: ImageInfo,
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
  /** 크리에이터 서클 부스 안내 */
  creator_circle_booth: v.string(),
  /** 기업 부스 안내 */
  creator_company_booth: v.string(),
  /** 특별존 안내 */
  creator_special_zone: v.string(),
  /** 코스프레 안내 */
  cosp_cosplay: v.string(),
  /** 무대 안내 */
  stage: v.string(),
  /** 행사 스케줄 이미지 ID */
  event_schedule_image: v.number(),
  /** 행사 스케줄 이미지 노출 여부 */
  show_event_schedule_image_yn: v.picklist(["Y", "N"]),
  /** 행사 스케줄 텍스트 */
  event_schedule_text: v.string(),
  /** 행사 레이아웃 이미지 ID */
  event_layout_image: v.number(),
  /** 행사 레이아웃 이미지 노출 여부 */
  show_event_layout_image_yn: v.picklist(["Y", "N"]),
  /** 행사 레이아웃 텍스트 */
  event_layout_text: v.string(),
  /** 서클 리스트 노출 여부 */
  show_circle_list_yn: v.picklist(["Y", "N"]),
  /** 서클 리스트 텍스트 */
  circle_list_text: v.string(),
  /** 로고 이미지 상세 */
  event_logo_info: ImageInfo,
  /** 요약 이미지 1 상세 */
  event_summary_image_1_info: ImageInfo,
  /** 요약 이미지 2 상세 */
  event_summary_image_2_info: ImageInfo,
  /** 요약 이미지 3 상세 */
  event_summary_image_3_info: ImageInfo,
  /** 스폰서 목록 */
  sponsor_list: v.array(SponsorItem),
  /** 특별존 목록 */
  special_zone_list: v.array(SpecialZoneItem),
  /** 행사 스케줄 이미지 상세 */
  event_schedule_image_info: ImageInfo,
  /** 행사 레이아웃 이미지 상세 */
  event_layout_image_info: ImageInfo,
  /** 크리에이터 서클 이미지 목록 */
  creator_cicle_image_list: v.array(EventImageItem),
  /** 크리에이터 기업 이미지 목록 */
  creator_company_image_list: v.array(EventImageItem),
  /** 코스프레 이미지 목록 */
  cosplay_image_list: v.array(EventImageItem),
  /** 스테이지 이미지 목록 */
  stage_image_list: v.array(EventImageItem),
});

/** GET /event/info/detail/:id — 행사 상세 */
export const eventDetail = defineIllustarEndpoint({
  path: "/event/info/detail/:id",
  schema: v.object({
    detail: v.nullable(EventDetail),
  }),
});
