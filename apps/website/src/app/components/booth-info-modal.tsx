import { useEffect, useMemo, useState } from "react";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { Tweet } from "react-tweet";
import type { Circle } from "./circle-card";

export interface BoothInfo {
  booth_info_id: string;
  witchform_urls: string[];
  tweet_ids: string[];
  witchform_url_count: number;
  tweet_count: number;
}

interface OgPreview {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

function parseTweetId(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^\d+$/u.test(trimmed)) return trimmed;
  const match = trimmed.match(/status\/(\d+)/u);
  return match?.[1];
}

function extractMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "iu"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "iu"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "iu"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "iu"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function toAbsoluteUrl(base: string, raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

async function fetchOgDirect(url: string): Promise<OgPreview> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) return {};

  const html = await res.text();
  const title =
    extractMeta(html, "og:title") ??
    extractMeta(html, "twitter:title") ??
    extractMeta(html, "title");
  const description =
    extractMeta(html, "og:description") ??
    extractMeta(html, "twitter:description") ??
    extractMeta(html, "description");
  const imageRaw = extractMeta(html, "og:image") ?? extractMeta(html, "twitter:image");
  const canonicalRaw = extractMeta(html, "og:url") ?? extractMeta(html, "twitter:url");

  const og: OgPreview = {
    url: toAbsoluteUrl(url, canonicalRaw) ?? url,
  };

  if (title) og.title = title;
  if (description) og.description = description;
  const image = toAbsoluteUrl(url, imageRaw);
  if (image) og.image = image;

  return og;
}

export function BoothInfoModal({
  circle,
  boothInfos,
  loading,
  error,
  onClose,
}: {
  circle: Circle | null;
  boothInfos: BoothInfo[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [ogMap, setOgMap] = useState<Record<string, OgPreview>>({});

  const witchformUrls = useMemo(
    () => [...new Set(boothInfos.flatMap((info) => info.witchform_urls))],
    [boothInfos],
  );

  useEffect(() => {
    if (!circle) return;

    const missing = witchformUrls.filter((url) => ogMap[url] === undefined);
    if (missing.length === 0) return;

    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        missing.map(async (url) => {
          try {
            const og = await fetchOgDirect(url);
            return [url, og] as const;
          } catch {
            return [url, {}] as const;
          }
        }),
      );

      if (cancelled) return;
      setOgMap((prev) => {
        const next = { ...prev };
        for (const [url, og] of entries) {
          next[url] = og;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [circle, ogMap, witchformUrls]);

  if (!circle) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg border bg-background p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3 border-b pb-3">
          <div>
            <h3 className="font-semibold">{circle.booth_name}</h3>
            <p className="text-sm text-muted-foreground">{circle.booth_no}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading booth_info...</div>}
        {error && <div className="text-sm text-destructive">{error}</div>}

        {!loading && !error && boothInfos.length === 0 && (
          <div className="text-sm text-muted-foreground">연결된 booth_info가 없습니다.</div>
        )}

        {!loading && !error && boothInfos.length > 0 && (
          <div className="space-y-3">
            {boothInfos.map((info) => (
              <div key={info.booth_info_id} className="rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <code className="text-xs">{info.booth_info_id}</code>
                  <div className="text-xs text-muted-foreground">
                    witchform {info.witchform_url_count} · tweets {info.tweet_count}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Witchform URLs</p>
                    <ul className="space-y-2">
                      {info.witchform_urls.map((url) => {
                        const og = ogMap[url];
                        return (
                          <li key={url}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="block rounded border p-2 hover:bg-muted/30"
                            >
                              <div className="mb-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                {url}
                                <ExternalLinkIcon className="h-3 w-3" />
                              </div>
                              {(og?.title || og?.description || og?.image) && (
                                <div className="grid grid-cols-[1fr_auto] gap-2">
                                  <div className="min-w-0">
                                    {og.title && (
                                      <p className="truncate text-sm font-medium">{og.title}</p>
                                    )}
                                    {og.description && (
                                      <p className="line-clamp-2 text-xs text-muted-foreground">
                                        {og.description}
                                      </p>
                                    )}
                                  </div>
                                  {og.image && (
                                    <img
                                      src={og.image}
                                      alt={og.title ?? "opengraph image"}
                                      className="h-14 w-14 rounded object-cover"
                                    />
                                  )}
                                </div>
                              )}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Tweets</p>
                    <ul className="space-y-3">
                      {info.tweet_ids.map((rawId) => {
                        const tweetId = parseTweetId(rawId);
                        if (!tweetId) {
                          return (
                            <li key={rawId} className="text-xs text-muted-foreground">
                              {rawId}
                            </li>
                          );
                        }

                        return (
                          <li key={tweetId}>
                            <div className="mb-1">
                              <a
                                href={`https://x.com/i/web/status/${tweetId}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                {tweetId}
                                <ExternalLinkIcon className="h-3 w-3" />
                              </a>
                            </div>
                            <div className="rounded border bg-white p-2">
                              <Tweet
                                id={tweetId}
                                fallback={
                                  <div className="text-xs text-muted-foreground">
                                    Loading tweet…
                                  </div>
                                }
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
