import * as cheerio from "cheerio";

export interface WitchformFormData {
  title: string;
  // eslint-disable-next-line unicorn/no-null -- JSON serialization boundary
  sellerName: string | null;
  products: WitchformProductData[];
}

export interface WitchformProductData {
  index: number;
  name: string;
  // eslint-disable-next-line unicorn/no-null -- JSON serialization boundary
  price: number | null;
  // eslint-disable-next-line unicorn/no-null -- JSON serialization boundary
  imageUrl: string | null;
}

export async function fetchAndParseWitchform(url: string): Promise<WitchformFormData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Witchform fetch failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  return parseWitchformHtml(html);
}

export function parseWitchformHtml(html: string): WitchformFormData {
  const $ = cheerio.load(html);

  // Title from <title> or og:title
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const pageTitle = $("title").text().trim();
  const title = ogTitle || pageTitle || "";

  // Seller name from seller info area
  // eslint-disable-next-line unicorn/no-null -- JSON serialization boundary
  const sellerName = $(".seller-info span").first().text().trim() || null;

  // Products from quantity inputs with data attributes
  const products: WitchformProductData[] = [];
  $('input[id$="_number"][data-goods-name]').each((index, el) => {
    const $el = $(el);
    const name = $el.attr("data-goods-name") ?? "";
    const priceStr = $el.attr("data-goods-price");
    // eslint-disable-next-line unicorn/no-null -- JSON serialization boundary
    const price = priceStr ? Number.parseInt(priceStr, 10) : null;
    // eslint-disable-next-line unicorn/no-null -- JSON serialization boundary
    const imageUrl = $el.attr("data-goods-img") || null;

    if (name) {
      // eslint-disable-next-line unicorn/no-null -- JSON serialization boundary
      products.push({ index, name, price: Number.isNaN(price) ? null : price, imageUrl });
    }
  });

  return { title, sellerName, products };
}
