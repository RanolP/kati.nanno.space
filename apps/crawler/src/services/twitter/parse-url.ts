export interface ParsedTwitterUrl {
  username: string;
  tweetId?: string;
}

const twitterHostPattern = /^(?:(?:www\.)?(?:twitter|x)\.com)$/i;
const profilePathPattern = /^\/([A-Za-z0-9_]+)(?:\/status\/(\d+))?/;

export function parseTwitterUrl(raw: string): ParsedTwitterUrl | undefined {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;

  let urlStr = trimmed;
  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
    urlStr = `https://${urlStr}`;
  }

  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return undefined;
  }

  if (!twitterHostPattern.test(url.hostname)) return undefined;

  const match = profilePathPattern.exec(url.pathname);
  if (!match) return undefined;

  const username = match[1]!;
  // Skip common non-profile paths
  if (["home", "search", "explore", "settings", "i", "intent"].includes(username.toLowerCase())) {
    return undefined;
  }

  const tweetId = match.at(2);
  if (tweetId) return { username, tweetId };
  return { username };
}

/**
 * Extract Twitter URLs from a string that may contain multiple comma-separated URLs.
 */
export function extractTwitterUrls(text: string): ParsedTwitterUrl[] {
  const results: ParsedTwitterUrl[] = [];
  const parts = text.split(",");
  for (const part of parts) {
    const parsed = parseTwitterUrl(part);
    if (parsed) results.push(parsed);
  }
  return results;
}
