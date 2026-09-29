# AGENTS.md — Workspace UI

## Start here

Workspace API is the source of truth for the messenger. Read [Project Facts](docs/PROJECT_FACTS.md) for current entrypoints, backend contracts, and verification commands. Use source files and tests to verify details; archived plans and old ADR snapshots are not current implementation instructions.

- [Architecture](docs/fsd-architecture.md): ownership and imports.
- [Async safety](docs/ORG_SCOPED_ASYNC_SAFETY.md): runtime ownership and stale writes.
- [Integration guide](docs/INTEGRATION_GUIDE.md): workflow for feature changes.
- [Documentation index](docs/README.md): topic-specific references.

## Scope and working tree

- Analysis and review requests are read-only unless the user also authorizes edits. Report findings before proposing implementation.
- Preserve unrelated changes. Inspect `git status --short` before edits and before the final report. Stage only intended paths; commit or push only when requested.
- Extend existing flows before adding stores, helpers, or files. Create only the FSD segments the task needs.
- Preserve the visible UI unless the task asks for a design change. Follow the user's latest visual requirements and report unperformed visual checks.

## Domain and architecture

- Use Workspace UUIDs and the existing DTO-to-domain adapters. Do not add hidden Zulip fallbacks, numeric ID conversions, or fabricated domain data.
- Check the backend contract before declaring a capability unsupported. If it is unsupported, expose that state explicitly.
- `entities/messenger` owns catalogs and domain actions; `entities/message` owns the Workspace message store. Session and request ownership belong to `entities/workspace-auth` and `entities/workspace-runtime`.
- Dependencies flow `app -> pages -> widgets -> features -> entities -> shared`. Keep routes thin; compose workflows in their owning layer.
- Import concrete module files. Do not add barrel-only `index.ts` re-exports.
- Restore durable cache first where appropriate, refresh from the server, and update store and cache consistently. Scope data by runtime owner and reject stale async writes. Explain stricter loading when stale data would be unsafe.

## Code requirements

- TypeScript strict: no `any`, use type-only imports, handle missing indexed values.
- Zustand: narrow selectors and stable derived results; keep DTO adaptation outside UI rendering.
- UI text uses `~/i18n/i18n`; add keys to both locales. Use existing components, semantic theme tokens, and branding helpers.
- Render untrusted content through the existing sanitize/render path. Preserve keyboard access, focus handling, and accessible names.
- Use project logging helpers; never log credentials, tokens, PII, or message bodies.
- Code comments use simple English and explain non-obvious reasons.

## Verification

Use the command table in [Project Facts](docs/PROJECT_FACTS.md#verification). Run focused tests for changed behavior, typecheck for type/API/store changes, and broader checks when scope warrants them. Documentation-only work needs link/consistency checks, not the app test suite. Report actual commands and any gaps; do not claim manual or platform QA from unit tests.
