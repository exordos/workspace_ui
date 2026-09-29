# Project Facts

Verified against the local source tree on 2026-09-28. This is a navigation map; package manifests, scripts, and source files own exact versions and signatures.

## Packages and versions

| Package             | Manifest                                                            | Purpose                                    |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| `web`               | [packages/web/package.json](../packages/web/package.json)           | React SPA, Vite, Zustand, Tailwind, Vitest |
| `exordos-workspace` | [packages/electron/package.json](../packages/electron/package.json) | Electron shell and packaging               |

The release version is in [lerna.json](../lerna.json); use `npm run version:print`. Root commands and Node requirements are in [package.json](../package.json) and [.nvmrc](../.nvmrc). Do not copy dependency versions or slice counts into other documents.

## Runtime map

All paths below are relative to `packages/web/src`.

| Concern                                 | Source                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Routes                                  | [app/app.tsx](../packages/web/src/app/app.tsx)                                                              |
| IAM sessions and current runtime        | [workspace-auth.model.ts](../packages/web/src/entities/workspace-auth/workspace-auth.model.ts)              |
| Owner keys and request validity         | [workspace-runtime.lib.ts](../packages/web/src/entities/workspace-runtime/workspace-runtime.lib.ts)         |
| Catalogs, conversations, domain actions | [entities/messenger](../packages/web/src/entities/messenger/)                                               |
| Workspace message store                 | [message.model.ts](../packages/web/src/entities/message/message.model.ts)                                   |
| Users and presence                      | [entities/user](../packages/web/src/entities/user/)                                                         |
| Messenger REST                          | [messenger-client.ts](../packages/web/src/shared/api/messenger-client.ts) and adjacent `messenger-*.api.ts` |
| Common Workspace REST                   | [workspace-client.ts](../packages/web/src/shared/api/workspace-client.ts)                                   |
| IAM token requests                      | [workspace-iam-auth.ts](../packages/web/src/shared/api/workspace-iam-auth.ts)                               |
| Realtime transport                      | [shared/lib/workspace-realtime](../packages/web/src/shared/lib/workspace-realtime/)                         |
| Messenger cache                         | [workspace-messenger-cache-db.ts](../packages/web/src/shared/lib/workspace-messenger-cache-db.ts)           |
| Message rendering                       | [shared/lib/workspace-message-render](../packages/web/src/shared/lib/workspace-message-render/)             |
| Shell lifecycle                         | [widgets/layout](../packages/web/src/widgets/layout/)                                                       |
| Message list                            | [widgets/workspace-message-list](../packages/web/src/widgets/workspace-message-list/)                       |

Do not infer a module's backend from its old name. In particular, `entities/message` is Workspace-native. Remaining `zulip-*` helpers are not the default integration path for new messenger work.

## Backend contracts

Check the backend checkout and branch before drawing capability conclusions. The sibling checkout observed for this revision was on `master`.

Local paths, when the sibling checkout exists:

- `../workspace_backend/docs/en/workspace_api.md`
- `../workspace_backend/docs/en/workspace_ui_realtime_integration.md`

GitHub fallback (requires repository access):

- [Workspace API](https://github.com/exordos/workspace_backend/blob/master/docs/en/workspace_api.md)
- [Realtime integration](https://github.com/exordos/workspace_backend/blob/master/docs/en/workspace_ui_realtime_integration.md)

These branch links can move. For a release or a cross-repository change, record the backend revision actually inspected. A missing local file or failed network request is not evidence that a backend capability is absent.

## Verification

Run commands from the repository root unless stated otherwise.

| Change or purpose             | Command                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Documentation                 | `npm run docs:check` and `git diff --check`                                                      |
| Focused web behavior          | `npm run test --workspace=web -- src/path/to/file.test.ts` (replace the path)                    |
| Type/API/store contracts      | `npm run typecheck` (web and Electron)                                                           |
| All unit tests                | `npm run test` (web Vitest and Electron script tests)                                            |
| Broad web quality gate        | `npm run check` (web typecheck, lint, format, coverage; complexity report; npm audit)            |
| Electron scripts              | `npm run test --workspace=exordos-workspace`                                                     |
| User flow or route regression | Focused Playwright spec, e.g. `npm run e2e -- e2e/workspace-realtime.spec.ts --project=chromium` |

`npm run check` is not a substitute for Electron tests/typecheck, E2E, or visual QA. [GitHub CI](../.github/workflows/ci.yml) and [GitLab CI](../.gitlab-ci.yml) define what automation currently executes; not every local gate is enabled in CI.

## Git and releases

The integration branch is `master`. Inspect the active checkout with `git branch --show-current`; do not assume a permanent migration branch. Follow the user's branch/PR target when specified.

Release commands live in [version-bump.mjs](../scripts/version-bump.mjs) and [release-tag.mjs](../scripts/release-tag.mjs). Tagging/publishing is a separate action requiring authorization. See [Contributing](../CONTRIBUTING.md) and the deployment guides in the [documentation index](README.md).
