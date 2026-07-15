# @workspace/api

OpenAPI-driven TypeScript client for the IAM-authenticated Workspace UI API,
including common resources, Messenger, Mail, and Calendar. It is generated with
[Orval](https://orval.dev/).

This package intentionally does not contain the trusted Provider Service API.
Workspace UI must never call provider registration, entity sync, blob, or
command endpoints.

npm package name is `@workspace/api` (not `workspace-api` — that name is taken on the public registry by an unrelated Trimble package).

## Regenerate after spec changes

From the monorepo root:

```bash
npm run codegen:workspace-api
```

Or inside this package: `npm run codegen`.

Input: [`openapi/workspace.openapi.json`](openapi/workspace.openapi.json).  
Output: [`src/generated/workspace-api.ts`](src/generated/workspace-api.ts) (committed).

The web app registers an HTTP mutator at startup so requests go through `workspaceApi` (`packages/web` middleware pipeline). See `registerWorkspaceOrvalMutator()` in `packages/web/src/shared/api/workspace-orval-mutator.ts`.
