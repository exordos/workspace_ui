# @mail/api

OpenAPI contract and Orval-generated fetch client for the mail-proxy REST API (`/v1/mail/*`, `/v1/calendar/*`).

## Regenerate client

When [`openapi/mail-proxy.openapi.json`](openapi/mail-proxy.openapi.json) changes:

```bash
npm run codegen:mail-api
# or: npm run codegen --workspace=@mail/api
```

Commit the updated [`src/generated/mail-api.ts`](src/generated/mail-api.ts) alongside spec changes.

## Usage (web)

```typescript
import { setMailApiMutator } from "@mail/api/mail-api-mutator";
import { listMailFolders } from "@mail/api/mail-api.generated";
```

Register the mutator at bootstrap (see `packages/web/src/shared/api/mail-orval-mutator.ts`).
