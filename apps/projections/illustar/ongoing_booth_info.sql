-- Illustar ongoing booth info projection
-- Source: data/illustar/ongoing-booth-info.jsonl
-- Output: apps/website/public/data/ongoing_booth_info.parquet

COPY (
  SELECT
    id,
    round,
    event_type,
    name,
    status,
    place,
    start_date AS start_date,
    end_date AS end_date,
    show_date,
    ticket_open_date AS ticket_open_date,
    ticket_close_date AS ticket_close_date,
    ticket_date_desc,
    image,
    ticket_bg_image_pc,
    ticket_bg_image_mo,
    description,
    show_at_list,
    show_at_ongoing,
    -- ticket_bg_image_pc_info flattened
    original_name AS ticket_bg_image_pc_original_name,
    url AS ticket_bg_image_pc_url
  FROM read_json_auto('data/illustar/ongoing-booth-info.jsonl')
  ORDER BY id
) TO 'apps/website/public/data/ongoing_booth_info.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
