#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# Create output directories
mkdir -p apps/website/public/data/illustar
mkdir -p apps/website/public/data/find-info

# Run all projections
while IFS= read -r sql; do
  echo "Running: $sql"
  duckdb < "$sql"
done < <(find apps/projections -mindepth 2 -maxdepth 2 -name "*.sql" | sort)

echo "Done. Parquet files written to apps/website/public/data/"
