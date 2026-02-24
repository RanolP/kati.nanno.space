/* eslint-disable unicorn/filename-case */

import * as restate from "@restatedev/restate-sdk";
import { IllustarApiError } from "@kati/illustar-api";
import { eventDetail } from "@kati/illustar-api/endpoints";

import {
  getEventDetailInputStandardSchema,
  getEventDetailResponseStandardSchema,
} from "./schema.ts";
import type { GetEventDetailResponse } from "./schema.ts";

export const get_event_detail = restate.handlers.handler(
  {
    input: restate.serde.schema(getEventDetailInputStandardSchema),
    output: restate.serde.schema(getEventDetailResponseStandardSchema),
  },
  fetchEventDetail,
);

async function fetchEventDetail(
  ctx: restate.Context,
  input: { eventId: number },
): Promise<GetEventDetailResponse> {
  const request = eventDetail.makeRequest({ path: { id: input.eventId } });
  const init: RequestInit = {};
  if (request.method !== undefined) init.method = request.method;
  if (request.headers !== undefined) init.headers = request.headers;
  if (request.body !== undefined) init.body = request.body;

  const response = await ctx.run("illustar-get-event-detail", async () => {
    const fetched = await fetch(request.url, init);
    const bodyText = await fetched.text();
    return {
      ok: fetched.ok,
      status: fetched.status,
      bodyText,
    };
  });

  if (response.status === 404) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: `Event not found: ${input.eventId}` },
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch event detail: ${response.status}`);
  }

  const rawBody = Buffer.from(response.bodyText, "utf8");
  try {
    const parsed = eventDetail.parseResponse(rawBody);
    if (parsed.detail === null) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `Event not found: ${input.eventId}` },
      };
    }

    return {
      ok: true,
      data: parsed.detail,
    };
  } catch (error) {
    if (error instanceof IllustarApiError) {
      return {
        ok: false,
        error: { code: "API_ERROR", message: error.message },
      };
    }
    if (error instanceof Error) {
      return {
        ok: false,
        error: { code: "API_ERROR", message: error.message },
      };
    }

    throw error;
  }
}
