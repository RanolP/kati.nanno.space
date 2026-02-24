# Workflows app

This app is a minimal Restate host scaffold.

## AI stack

Workflows use Vercel AI SDK (`ai` + `@ai-sdk/google`), not `@google/genai`.
Shared model bootstrap lives in `src/services/ai.ts`.
Env key: `AI_KEY_GEMINI`

## Services

- `MediaClassifier/classifyMedia`
  - Input: `{ mediaUrl: string, tweetText?: string }`
  - Output: `{ ok: true, data } | { ok: false, error }` (never throws at handler boundary)

## Why this layout

Based on Restate docs guidance:

1. Define each independently callable job as its own **workflow service**.
2. Keep workflow orchestration in `run`, and place side-effecting I/O in separate **service handlers** (activities).
3. Run multiple services/workflows in one endpoint with `restate.serve({ services: [...] })`.

This keeps workflows isolated by workflow key while reusing shared activity services.

References:

- https://docs.restate.dev/guides/workflows
- https://docs.restate.dev/guides/service-communication
- https://docs.restate.dev/guides/parallelizing-work
- https://docs.restate.dev/develop/typescript

## Run

```bash
pnpm --filter @kati/workflows build
pnpm --filter @kati/workflows start
```

or watch mode:

```bash
pnpm --filter @kati/workflows dev
```

Add your workflow/service definitions under `src/` and register them in `src/index.ts`.
