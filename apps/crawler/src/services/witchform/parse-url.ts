const witchformPatterns = [
  // https://witchform.com/deposit_form.php?idx=975896
  /https?:\/\/(?:www\.)?witchform\.com\/deposit_form\.php\?idx=\d+/,
  // https://witchform.com/payform/?uuid=...
  /https?:\/\/(?:www\.)?witchform\.com\/payform\/\?uuid=[^&\s]+/,
  // https://witchform.com/payform/...
  /https?:\/\/(?:www\.)?witchform\.com\/payform\/[^?\s]+/,
] as const;

const witchformUrlRegex = new RegExp(witchformPatterns.map((p) => p.source).join("|"), "gi");

export function extractWitchformUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(witchformUrlRegex);
  if (!matches) return [];
  // Deduplicate
  return [...new Set(matches)];
}

export function isWitchformUrl(url: string): boolean {
  return witchformPatterns.some((pattern) => pattern.test(url));
}
