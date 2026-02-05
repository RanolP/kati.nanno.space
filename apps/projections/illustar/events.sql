-- Illustar events projection
-- Source: data/illustar/events.jsonl
-- Output: apps/website/public/data/events.parquet

COPY (
  SELECT
    id,
    round,
    event_type,
    name,
    status,
    place,
    epoch_ms(start_date) AS start_date,
    epoch_ms(end_date) AS end_date,
    show_date,
    epoch_ms(ticket_open_date) AS ticket_open_date,
    epoch_ms(ticket_close_date) AS ticket_close_date,
    ticket_date_desc,
    image,
    ticket_bg_image_pc,
    ticket_bg_image_mo,
    description,
    show_at_list,
    show_at_ongoing
  FROM read_json_auto('data/illustar/events.jsonl')
  ORDER BY id
) TO 'apps/website/public/data/illustar/events.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
