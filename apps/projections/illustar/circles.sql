-- Illustar circles (booths) projection
-- Source: data/illustar/circles.jsonl
-- Output: apps/website/public/data/illustar/circles.parquet
-- FK: event_id -> ongoing_booth_info.id

COPY (
  SELECT
    id,
    event_id,
    event_booth_application_id,
    booth_no,
    booth_name,
    booth_status,
    booth_type,
    date_type,
    zone_type,
    size_type,
    complexity_type,
    exp_type,
    genre_type,
    goods_type,
    user_region,
    user_nickname,
    near_booth,
    homepage,
    introduce,
    tag,
    image,
    image_info.id AS image_info_id,
    image_info.original_name AS image_info_original_name,
    image_info.url AS image_info_url
  FROM read_json_auto('data/illustar/circles.jsonl')
  ORDER BY id
) TO 'apps/website/public/data/illustar/circles.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
