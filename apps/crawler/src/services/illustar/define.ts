import * as v from "valibot";

import type { Endpoint, EndpointRequest } from "../endpoint.ts";
import type { IllustarRawResponse } from "./interceptor.ts";
import { decodeIllustarResponse } from "./interceptor.ts";

const BASE_URL = "https://api.illustar.net/v1";

// --- Path param extraction from path string ---

type ExtractPathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? Record<Param | keyof ExtractPathParams<Rest>, string | number>
  : P extends `${string}:${infer Param}`
    ? Record<Param, string | number>
    : Record<never, never>;

type HasPathParams<P extends string> = keyof ExtractPathParams<P> extends never ? false : true;

type IllustarInput<Path extends string, Query> = [HasPathParams<Path>, Query] extends [
  false,
  undefined,
]
  ? void
  : [HasPathParams<Path>, Query] extends [true, undefined]
    ? { path: ExtractPathParams<Path> }
    : [HasPathParams<Path>, Query] extends [false, infer Q]
      ? { query: Q }
      : { path: ExtractPathParams<Path>; query: Query };

interface IllustarEndpointConfig<Path extends string, O> {
  path: Path;
  schema: v.GenericSchema<unknown, O>;
}

// Overload: no query params
export function defineIllustarEndpoint<const Path extends string, O>(
  config: IllustarEndpointConfig<Path, O>,
): Endpoint<IllustarInput<Path, undefined>, O>;

// Overload: with query params
export function defineIllustarEndpoint<
  const Path extends string,
  Q extends Record<string, string | number>,
  O,
>(config: IllustarEndpointConfig<Path, O>): Endpoint<IllustarInput<Path, Q>, O>;

// Implementation
export function defineIllustarEndpoint<const Path extends string, O>(
  config: IllustarEndpointConfig<Path, O>,
): Endpoint<
  { path?: Record<string, string | number>; query?: Record<string, string | number> } | void,
  O
> {
  return {
    makeRequest(input): EndpointRequest {
      let resolvedPath: string = config.path;
      const queryParams = new URLSearchParams();

      if (input) {
        const { path, query } = input;
        if (path) {
          for (const [key, value] of Object.entries(path)) {
            resolvedPath = resolvedPath.replace(`:${key}`, String(value));
          }
        }
        if (query) {
          for (const [key, value] of Object.entries(query)) {
            queryParams.set(key, String(value));
          }
        }
      }

      const qs = queryParams.toString();
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
