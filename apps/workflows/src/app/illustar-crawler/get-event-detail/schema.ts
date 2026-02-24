import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

export const getEventDetailInputSchema = v.object({
  eventId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  renew: v.optional(v.boolean()),
});

const imageInfoSchema = v.object({
  id: v.number(),
  parent_table_key: v.union([v.string(), v.number()]),
  original_name: v.string(),
  url: v.string(),
});

const eventImageItemSchema = v.object({
  id: v.number(),
  event_id: v.number(),
  category: v.string(),
  url: v.string(),
  delete_yn: v.picklist(["Y", "N"]),
  created_at: v.string(),
  updated_at: v.string(),
  deleted_at: v.nullable(v.string()),
});

const sponsorItemSchema = v.object({
  id: v.number(),
  event_id: v.number(),
  sponsor_type: v.string(),
  sponsor_sort: v.number(),
  sponsor_name: v.string(),
  sponsor_image: v.number(),
  sponsor_desc: v.string(),
  image_info: imageInfoSchema,
});

const specialZoneItemSchema = v.object({
  id: v.number(),
  event_id: v.number(),
  zone_sort: v.number(),
  zone_name: v.string(),
  zone_desc: v.string(),
  zone_image: v.number(),
  image_info: imageInfoSchema,
});

const eventDetailSchema = v.object({
  event_id: v.number(),
  event_name: v.string(),
  event_date: v.string(),
  event_time: v.string(),
  event_location: v.string(),
  event_logo: v.number(),
  event_summary_image_1: v.number(),
  event_summary_image_2: v.number(),
  event_summary_image_3: v.number(),
  event_caution: v.string(),
  creator_circle_booth: v.string(),
  creator_company_booth: v.string(),
  creator_special_zone: v.string(),
  cosp_cosplay: v.string(),
  stage: v.string(),
  event_schedule_image: v.number(),
  show_event_schedule_image_yn: v.picklist(["Y", "N"]),
  event_schedule_text: v.string(),
  event_layout_image: v.number(),
  show_event_layout_image_yn: v.picklist(["Y", "N"]),
  event_layout_text: v.string(),
  show_circle_list_yn: v.picklist(["Y", "N"]),
  circle_list_text: v.string(),
  event_logo_info: imageInfoSchema,
  event_summary_image_1_info: imageInfoSchema,
  event_summary_image_2_info: imageInfoSchema,
  event_summary_image_3_info: imageInfoSchema,
  sponsor_list: v.array(sponsorItemSchema),
  special_zone_list: v.array(specialZoneItemSchema),
  event_schedule_image_info: imageInfoSchema,
  event_layout_image_info: imageInfoSchema,
  creator_cicle_image_list: v.array(eventImageItemSchema),
  creator_company_image_list: v.array(eventImageItemSchema),
  cosplay_image_list: v.array(eventImageItemSchema),
  stage_image_list: v.array(eventImageItemSchema),
});

export type GetEventDetailData = v.InferOutput<typeof eventDetailSchema>;

const getEventDetailErrorSchema = v.object({
  code: v.picklist(["NOT_FOUND", "API_ERROR"]),
  message: v.string(),
});

export const getEventDetailResponseSchema = v.variant("ok", [
  v.object({
    ok: v.literal(true),
    data: eventDetailSchema,
  }),
  v.object({
    ok: v.literal(false),
    error: getEventDetailErrorSchema,
  }),
]);

export type GetEventDetailResponse = v.InferOutput<typeof getEventDetailResponseSchema>;

export const getEventDetailInputStandardSchema = {
  ...getEventDetailInputSchema,
  "~standard": {
    ...getEventDetailInputSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(getEventDetailInputSchema),
    },
  },
};

export const getEventDetailResponseStandardSchema = {
  ...getEventDetailResponseSchema,
  "~standard": {
    ...getEventDetailResponseSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(getEventDetailResponseSchema),
    },
  },
};
