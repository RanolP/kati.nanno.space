/* eslint-disable unicorn/filename-case */

import * as restate from "@restatedev/restate-sdk";
import { IllustarApiError } from "@kati/illustar-api";
import { ongoingBoothInfo } from "@kati/illustar-api/endpoints";

import { illustarCrawler } from "@/app/illustar-crawler/service.ts";
import { saveOngoingBoothInfoItems } from "@/features/illustar/ongoing-booth-info-repository.ts";
import type { OngoingBoothInfoItem } from "./schema.ts";

export const accumulate_ongoing_booth_info = restate.handlers.handler({}, async (ctx) => {
  const request = ongoingBoothInfo.makeRequest();
  const init: RequestInit = {};
  if (request.method !== undefined) init.method = request.method;
  if (request.headers !== undefined) init.headers = request.headers;
  if (request.body !== undefined) init.body = request.body;

  const response = await ctx.run("illustar-get-ongoing-booth-info", async () => {
    const fetched = await fetch(request.url, init);
    const bodyText = await fetched.text();
    return {
      ok: fetched.ok,
      status: fetched.status,
      bodyText,
    };
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ongoing booth info: ${response.status}`);
  }

  const rawBody = Buffer.from(response.bodyText, "utf8");
  const parsed = (() => {
    try {
      return ongoingBoothInfo.parseResponse(rawBody);
    } catch (error) {
      if (error instanceof IllustarApiError) {
        throw new Error(error.message);
      }
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw error;
    }
  })();

  const items: OngoingBoothInfoItem[] = parsed.boothInfo.map((item) => ({
    id: item.id,
    round: item.round,
    eventType: item.event_type,
    name: item.name,
    status: item.status,
    place: item.place,
    startDate: item.start_date,
    endDate: item.end_date,
    showDate: item.show_date,
    ticketOpenDate: item.ticket_open_date,
    image: item.image,
    ticketCloseDate: item.ticket_close_date,
    ticketDateDesc: item.ticket_date_desc,
    ticketBgImagePc: item.ticket_bg_image_pc,
    ticketBgImageMo: item.ticket_bg_image_mo,
    description: item.description,
    showAtList: item.show_at_list,
    showAtOngoing: item.show_at_ongoing,
    ticketBgImagePcInfo: {
      id: item.ticket_bg_image_pc_info.id,
      parentTableKey: item.ticket_bg_image_pc_info.parent_table_key,
      originalName: item.ticket_bg_image_pc_info.original_name,
      url: item.ticket_bg_image_pc_info.url,
    },
  }));

  await ctx.run("pg-save-ongoing-booth-info", () => saveOngoingBoothInfoItems(items));

  for (const item of parsed.boothInfo) {
    ctx.serviceSendClient(illustarCrawler).get_event_detail({
      eventId: item.id,
      renew: true,
    });
  }
});
