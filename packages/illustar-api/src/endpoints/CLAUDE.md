# Illustar API Endpoint Definitions

## Naming Convention

File paths mirror the API URL path. Path parameters use bracket notation. The HTTP method is the filename.

```
API: GET /circle              → circle/get.ts
API: GET /circle/:id          → circle/[id]/get.ts
API: GET /event/list          → event/list/get.ts
API: GET /event/info/detail/:id → event/info/detail/[id]/get.ts
API: GET /main/ongoingBoothInfo → main/ongoing-booth-info/get.ts
API: GET /main/schedule       → main/schedule/get.ts
```

- Directory segments match API path segments (kebab-case for filenames/dirs, even if the API uses camelCase).
- `[param]` directories represent path parameters (`:param` in `defineIllustarEndpoint`).
- The leaf file is the lowercase HTTP method: `get.ts`, `post.ts`, etc.
