-- Illustar schedule projection
-- Source: data/illustar/schedule.jsonl
-- Output: apps/website/public/data/illustar/schedule.parquet

COPY (
  SELECT
    id,
    event_name,
    TRY_CAST(event_date AS DATE) AS event_date,
    event_location,
    event_desc,
    image,
    image_info_original_name AS image_original_name,
    image_info_url AS image_url
  FROM read_json_auto('data/illustar/schedule.jsonl')
  ORDER BY id
) TO 'apps/website/public/data/illustar/schedule.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
