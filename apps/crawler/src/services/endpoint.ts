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

export interface FetchInterceptor {
  onRequest?(request: Request): Request | Promise<Request>;
  onResponse?(response: Response): Response | Promise<Response>;
}

export interface ProgressEvent {
  loaded: number;
  total: number | undefined;
}

export type ProgressHandler = (event: ProgressEvent) => void;

export interface Fetcher {
  fetch<O>(endpoint: Endpoint<void, O>, onProgress?: ProgressHandler): Promise<O>;
  fetch<I, O>(endpoint: Endpoint<I, O>, input: I, onProgress?: ProgressHandler): Promise<O>;
}

async function readBodyWithProgress(
  response: Response,
  onProgress?: ProgressHandler,
): Promise<Buffer> {
  if (!onProgress || !response.body) {
    return Buffer.from(await response.arrayBuffer());
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? Number(contentLength) : undefined;
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for await (const chunk of response.body) {
    chunks.push(chunk);
    loaded += chunk.byteLength;
    onProgress({ loaded, total });
  }

  return Buffer.concat(chunks);
}

export function createFetcher(interceptors: readonly FetchInterceptor[] = []): Fetcher {
  return {
    async fetch<I, O>(
      endpoint: Endpoint<I, O>,
      input: I,
      onProgress?: ProgressHandler,
    ): Promise<O> {
      const { url, ...init } = endpoint.makeRequest(input);

      let request = new Request(url, init);
      for (const interceptor of interceptors) {
        if (interceptor.onRequest) {
          request = await interceptor.onRequest(request);
        }
      }

      let response = await globalThis.fetch(request);
      for (const interceptor of interceptors) {
        if (interceptor.onResponse) {
          response = await interceptor.onResponse(response);
        }
      }

      const buffer = await readBodyWithProgress(response, onProgress);
      return endpoint.parseResponse(buffer);
    },
  };
}
