-- Illustar concerts projection
-- Source: data/illustar/concerts.jsonl
-- Output: apps/website/public/data/concerts.parquet

COPY (
  SELECT
    id,
    name,
    status,
    place,
    epoch_ms(start_date) AS start_date,
    epoch_ms(end_date) AS end_date,
    show_date,
    thumbnail_image_url,
    epoch_ms(ticket_open_date) AS ticket_open_date,
    epoch_ms(ticket_close_date) AS ticket_close_date,
    ticket_date_desc
  FROM read_json_auto('data/illustar/concerts.jsonl')
  ORDER BY id
) TO 'apps/website/public/data/concerts.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
