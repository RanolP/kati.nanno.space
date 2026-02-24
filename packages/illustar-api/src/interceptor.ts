import { inflateSync } from "node:zlib";

export interface IllustarRawResponse {
  errorCode: number;
  errorMsg: string;
  data: unknown;
}

export class IllustarApiError extends Error {
  readonly errorCode: number;
  readonly errorMsg: string;

  constructor(errorCode: number, errorMsg: string) {
    super(`Illustar API error ${errorCode}: ${errorMsg}`);
    this.name = "IllustarApiError";
    this.errorCode = errorCode;
    this.errorMsg = errorMsg;
  }
}

function isCompressedData(data: unknown): data is Record<string, number> {
  return typeof data === "object" && data !== null && "0" in data;
}

export function decodeIllustarResponse(raw: IllustarRawResponse): unknown {
  if (raw.errorCode !== 0) {
    throw new IllustarApiError(raw.errorCode, raw.errorMsg);
  }

  if (isCompressedData(raw.data)) {
    const bytes = Object.values(raw.data);
    const decompressed = inflateSync(Buffer.from(bytes));
    return JSON.parse(decompressed.toString("utf8"));
  }

  return raw.data;
}
