# AGENTS.md (apps/workflows)

## Naming convention for Restate

- Service name (runtime identifier): `PascalCase`
- Handler name (runtime identifier): `snake_case`

## Source layout convention

- Handler source file path: `src/app/{domain-kebab}/{service-kebab}/handler.ts`
- Helper files for that handler live beside it in the same folder.
- Runtime service name still uses `PascalCase` inside code.
