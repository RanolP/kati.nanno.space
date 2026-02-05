#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Create output directories
mkdir -p apps/website/public/data/illustar

# Run all projections
for sql in apps/projections/illustar/*.sql; do
  echo "Running: $sql"
  duckdb < "$sql"
done

echo "Done. Parquet files written to apps/website/public/data/"
