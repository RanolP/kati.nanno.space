export interface Endpoint<I, O> {
  makeRequest(input: I): EndpointRequest;
  parseResponse(buffer: Buffer): O;
}

export interface EndpointRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Buffer;
}
