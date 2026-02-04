-- Illustar schedule projection
-- Source: data/illustar/schedule.jsonl
-- Output: apps/website/public/data/schedule.parquet

COPY (
  SELECT
    id,
    event_name,
    TRY_CAST(event_date AS DATE) AS event_date,
    event_location,
    event_desc,
    image,
    original_name AS image_original_name,
    url AS image_url
  FROM read_json_auto('data/illustar/schedule.jsonl')
  ORDER BY id
) TO 'apps/website/public/data/schedule.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
