-- Find-info circle ↔ booth_info bridge projection
-- Source: data/find-info/circle-booth-relations.json
-- Output: apps/website/public/data/find-info/circle_booth_info.parquet

COPY (
  WITH src AS (
    SELECT *
    FROM read_json_auto('data/find-info/circle-booth-relations.json')
  ),
  circles AS (
    SELECT
      c.unnest.illustar_circle_id AS illustar_circle_id,
      c.unnest.booth_infos AS booth_infos,
      src.generated_at AS generated_at
    FROM src, UNNEST(src.circles) AS c(unnest)
  ),
  base AS (
    SELECT
      circles.illustar_circle_id,
      b.unnest.witchform_id AS booth_info_id,
      circles.generated_at
    FROM circles, UNNEST(circles.booth_infos) AS b(unnest)
  )
  SELECT DISTINCT
    illustar_circle_id,
    booth_info_id,
    generated_at
  FROM base
  ORDER BY illustar_circle_id, booth_info_id
) TO 'apps/website/public/data/find-info/circle_booth_info.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
