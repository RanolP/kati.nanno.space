import * as v from "valibot";

import type { Endpoint, EndpointRequest } from "../endpoint.ts";
import type { IllustarRawResponse } from "./interceptor.ts";
import { decodeIllustarResponse } from "./interceptor.ts";

const BASE_URL = "https://api.illustar.net/v1";

interface IllustarEndpointConfig<O> {
  path: string;
  schema: v.GenericSchema<unknown, O>;
}

export function defineIllustarEndpoint<O>(config: IllustarEndpointConfig<O>): Endpoint<void, O>;
export function defineIllustarEndpoint<I extends Record<string, string | number>, O>(
  config: IllustarEndpointConfig<O>,
): Endpoint<I, O>;
export function defineIllustarEndpoint<O>(
  config: IllustarEndpointConfig<O>,
): Endpoint<Record<string, string | number> | void, O> {
  return {
    makeRequest(input): EndpointRequest {
      let resolvedPath = config.path;
      const query = new URLSearchParams();

      if (input) {
        for (const [key, value] of Object.entries(input)) {
          const placeholder = `:${key}`;
          if (resolvedPath.includes(placeholder)) {
            resolvedPath = resolvedPath.replace(placeholder, String(value));
          } else {
            query.set(key, String(value));
          }
        }
      }

      const qs = query.toString();
      const url = `${BASE_URL}${resolvedPath}${qs ? `?${qs}` : ""}`;

      return { url };
    },

    parseResponse(buffer: Buffer): O {
      const raw: IllustarRawResponse = JSON.parse(buffer.toString("utf8"));
      const data = decodeIllustarResponse(raw);
      return v.parse(config.schema, data);
    },
  };
}
