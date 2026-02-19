-- Find-info booth_info projection
-- Source: data/find-info/circle-booth-relations.json
-- Output: apps/website/public/data/find-info/booth_info.parquet

COPY (
  WITH src AS (
    SELECT *
    FROM read_json_auto('data/find-info/circle-booth-relations.json')
  ),
  circles AS (
    SELECT
      c.unnest.booth_infos AS booth_infos,
      src.generated_at AS generated_at
    FROM src, UNNEST(src.circles) AS c(unnest)
  ),
  base AS (
    SELECT
      b.unnest.witchform_id AS booth_info_id,
      b.unnest.witchform_urls AS witchform_urls,
      b.unnest.tweet_ids AS tweet_ids,
      circles.generated_at
    FROM circles, UNNEST(circles.booth_infos) AS b(unnest)
  ),
  urls AS (
    SELECT
      base.booth_info_id,
      u.unnest AS witchform_url
    FROM base, UNNEST(base.witchform_urls) AS u(unnest)
  ),
  tweets AS (
    SELECT
      base.booth_info_id,
      t.unnest AS tweet_id
    FROM base, UNNEST(base.tweet_ids) AS t(unnest)
  )
  SELECT
    b.booth_info_id,
    list(DISTINCT urls.witchform_url ORDER BY urls.witchform_url) AS witchform_urls,
    list(DISTINCT tweets.tweet_id ORDER BY tweets.tweet_id) AS tweet_ids,
    count(DISTINCT urls.witchform_url) AS witchform_url_count,
    count(DISTINCT tweets.tweet_id) AS tweet_count,
    max(b.generated_at) AS generated_at
  FROM (SELECT DISTINCT booth_info_id, generated_at FROM base) AS b
  LEFT JOIN urls USING (booth_info_id)
  LEFT JOIN tweets USING (booth_info_id)
  GROUP BY b.booth_info_id
  ORDER BY b.booth_info_id
) TO 'apps/website/public/data/find-info/booth_info.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
