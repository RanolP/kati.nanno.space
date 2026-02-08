import { collection, composite, scalar } from "../../features/model/index.ts";

// --- Illustar goods_list images ---

const goodsImage = composite({
  circle_id: scalar.number(),
  image_id: scalar.number(),
  image_url: scalar.string(),
  original_name: scalar.string(),
});

export const goodsImageCollection = collection(
  goodsImage,
  (g) => [g.circle_id, g.image_id] as const,
);

// --- Twitter media images ---

const twitterMedia = composite({
  circle_id: scalar.number(),
  tweet_id: scalar.string(),
  image_url: scalar.string(),
  twitter_username: scalar.string(),
  tweet_text: scalar.string(),
  tweeted_at: scalar.string(),
});

export const twitterMediaCollection = collection(
  twitterMedia,
  (t) => [t.circle_id, t.tweet_id, t.image_url] as const,
);

// --- Twitter links ---

const twitterLink = composite({
  circle_id: scalar.number(),
  tweet_id: scalar.string(),
  link_url: scalar.string(),
  twitter_username: scalar.string(),
  tweet_text: scalar.string(),
  tweeted_at: scalar.string(),
});

export const twitterLinkCollection = collection(
  twitterLink,
  (t) => [t.circle_id, t.tweet_id, t.link_url] as const,
);

// --- Witchform products ---

const witchformProduct = composite({
  circle_id: scalar.number(),
  witchform_url: scalar.string(),
  form_title: scalar.string(),
  product_index: scalar.number(),
  product_name: scalar.string(),
  price: scalar.nullable(scalar.number()),
  image_url: scalar.nullable(scalar.string()),
});

export const witchformProductCollection = collection(
  witchformProduct,
  (w) => [w.circle_id, w.witchform_url, w.product_index] as const,
);
