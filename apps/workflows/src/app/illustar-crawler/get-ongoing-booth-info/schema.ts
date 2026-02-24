import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

export const getOngoingBoothInfoInputSchema = v.object({});

const ticketBgImageInfoSchema = v.object({
  id: v.number(),
  parentTableKey: v.union([v.string(), v.number()]),
  originalName: v.string(),
  url: v.string(),
});

export const ongoingBoothInfoItemSchema = v.object({
  id: v.number(),
  round: v.number(),
  eventType: v.string(),
  name: v.string(),
  status: v.string(),
  place: v.string(),
  startDate: v.nullable(v.number()),
  endDate: v.nullable(v.number()),
  showDate: v.string(),
  ticketOpenDate: v.nullable(v.number()),
  image: v.number(),
  ticketCloseDate: v.nullable(v.number()),
  ticketDateDesc: v.nullable(v.string()),
  ticketBgImagePc: v.number(),
  ticketBgImageMo: v.number(),
  description: v.nullable(v.string()),
  showAtList: v.boolean(),
  showAtOngoing: v.boolean(),
  ticketBgImagePcInfo: ticketBgImageInfoSchema,
});
export type OngoingBoothInfoItem = v.InferOutput<typeof ongoingBoothInfoItemSchema>;

const getOngoingBoothInfoErrorSchema = v.object({
  code: v.picklist(["API_ERROR"]),
  message: v.string(),
});

export const getOngoingBoothInfoResponseSchema = v.variant("ok", [
  v.object({
    ok: v.literal(true),
    data: v.array(ongoingBoothInfoItemSchema),
  }),
  v.object({
    ok: v.literal(false),
    error: getOngoingBoothInfoErrorSchema,
  }),
]);

export type GetOngoingBoothInfoResponse = v.InferOutput<typeof getOngoingBoothInfoResponseSchema>;

export const getOngoingBoothInfoInputStandardSchema = {
  ...getOngoingBoothInfoInputSchema,
  "~standard": {
    ...getOngoingBoothInfoInputSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(getOngoingBoothInfoInputSchema),
    },
  },
};

export const getOngoingBoothInfoResponseStandardSchema = {
  ...getOngoingBoothInfoResponseSchema,
  "~standard": {
    ...getOngoingBoothInfoResponseSchema["~standard"],
    jsonSchema: {
      output: () => toJsonSchema(getOngoingBoothInfoResponseSchema),
    },
  },
};
