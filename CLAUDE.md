# KATI Project Context

## Self-Learning

- You shall edit CLAUDE.md to keep important contexts
- You shall edit CLAUDE.md to work better. especially, the preference the user said.
- Be concise. Only elaborate when the user asks for detail.
- Always verify changes by running them. Never use escape-hatch assumptions.

## What is KATI?
An open data platform that crawls Korean subculture event information and serves it as Parquet files. No backend database — Parquet in the repo is the source of truth.

## Architecture
- **Monorepo** with pnpm workspace: `apps/crawler`, `apps/website`
- **Crawler**: Runs via GitHub Actions cron (daily midnight KST), commits Parquet files to the repo
  - Uses React + ink for terminal UI (core feature, not optional)
  - Valibot for data validation, cheerio for HTML parsing, ky for HTTP
  - Must be reliable (retries, partial failure handling), extensible (plugin-style data sources), observable (clear logs)
- **Website**: SolidJS SSR app with DuckDB-WASM for in-browser SQL queries against Parquet data

## Conventions
- Use pnpm (never npm)
- All packages use `"type": "module"` (ESM by default)
- Shared dependencies use pnpm catalog (in `pnpm-workspace.yaml`) for version pinning
- TypeScript throughout
- Server-side TS runs via Node 24+ native support (no tsx/ts-node). Only website is bundled.
- Data sources start with Illustar Fest and Comic World, expanding over time
- Script naming: use `check:<tool>` pattern (e.g. `check:lint`, `check:type`, `check:fmt`). Root `check` runs all via turbo. Keep turbo task names and package.json script names in sync.

## Key Decisions
- Sorted JSONL files committed to repo = single source of truth (git-diff friendly)
- Parquet generated from JSONL in CI build step, not committed
- No backend database
- DuckDB-WASM in the browser for data querying
- Ink terminal UI is a first-class feature for the crawler
- Pure data tool — no user accounts or social features (for now)

## Model System (`apps/crawler/src/model/`)
Three composable primitives:
- **Scalar**: string | number | boolean | enum — merge = latest wins
- **Composite**: struct of named fields (each a Model) — merge = recursive per-field
- **Collection**: Map<string, Model> with composite key function — merge = union by key, recursive merge on collision

Data normalization (RDB-style): nested collections → separate JSONL files joined by foreign keys.
JSONL sort: by composite key, elementwise (number=numeric, string=alphabetical).

## Task System (planned)
- Per-source pipelines via builder/fluent API
- 3 task types: RUN_STEP (sequential), RUN_PARALLEL (concurrent), SOLELY_OWNED (hierarchical lock key)
- Tasks are pure (only network side-effects), return data → Model handles merge
- Lifecycle events (start/progress/done/error) → Ink UI rendering
- Fail-fast default, per-task opt-in retries for rate limits
