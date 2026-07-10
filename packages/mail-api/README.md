# @mail/api

OpenAPI contract and Orval-generated fetch client for the mail-proxy REST API (`/v1/mail/*`, `/v1/calendar/*`).

## Regenerate client

When [`openapi/mail-proxy.openapi.json`](openapi/mail-proxy.openapi.json) changes:

```bash
npm run codegen:mail-api
# or: npm run codegen --workspace=@mail/api
```

Commit the updated [`src/generated/mail-api.ts`](src/generated/mail-api.ts) alongside spec changes.

`codegen:mail-api` also exports static docs to [`../mail-proxy/docs/`](../mail-proxy/docs/).

## OpenAPI files

| Path                                                                 | Purpose                                             |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| [`openapi/mail-proxy.openapi.json`](openapi/mail-proxy.openapi.json) | Source of truth (edit this)                         |
| [`../mail-proxy/docs/openapi.json`](../mail-proxy/docs/openapi.json) | Exported copy (`servers` → `http://localhost:8787`) |
| [`../mail-proxy/docs/swagger.html`](../mail-proxy/docs/swagger.html) | Standalone Swagger UI (open in browser)             |

Export only:

```bash
npm run docs:mail-proxy
# or: npm run export:docs --workspace=@mail/api
```

## API docs (live server)

When `mail-proxy` is running (`npm run dev:mail-proxy`):

| URL                                | Content             |
| ---------------------------------- | ------------------- |
| http://localhost:8787/docs         | Swagger UI          |
| http://localhost:8787/openapi.json | OpenAPI 3.0 spec    |
| http://localhost:8787/swagger      | Redirect to `/docs` |

## Usage (web)

```typescript
import { setMailApiMutator } from "@mail/api/mail-api-mutator";
import { listMailFolders } from "@mail/api/mail-api.generated";
```

Register the mutator at bootstrap (see `packages/web/src/shared/api/mail-orval-mutator.ts`).
