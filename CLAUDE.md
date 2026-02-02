# KATI Project Context

## Self-Learning

- You shall edit CLAUDE.md and docs/ to keep important contexts
- You shall edit CLAUDE.md to work better. especially, the preference the user said.
- Be concise. Only elaborate when the user asks for detail.
- Always verify changes by running them. Never use escape-hatch assumptions.
- Never run oxlint/oxfmt directly. Always use `pnpm run check` (or `pnpm run check:lint`, `pnpm run check:type`, `pnpm run check:fmt`) from the root directory.
- To auto-fix: `pnpm run fix:fmt` (format) or `pnpm run fix:lint` (lint fixes).
- Many pedantic lint rules are disabled in `.oxlintrc.json`. When new code triggers unfamiliar lint errors, check if the rule should be disabled globally rather than working around it in code.

## What is KATI?
An open data platform that crawls Korean subculture event information and serves it via sorted JSONL (git) and Parquet (CI-built).

## Knowledge Base
All detailed design docs live in `docs/`. Each file starts with a `# Title` summary line.
- Run `tree docs/` to discover available topics
- Run `head -1 docs/*.md` to see a summary of each doc
- Then read the relevant doc(s) in full as needed
