# Workspace sticker catalog integration

Implemented on `feat/workspace-sticker-catalog`.
Backend reference: `workspace_backend`, `feature/sticker-catalog-api`, `c13e1ba`.

## Contract sources

The implementation was checked against backend `docs/ru/sticker_catalog_api_tz.md`,
`workspace/messenger_api/api/openapi_contract.py`, `api/sticker_controllers.py`,
`sticker_catalog.py`, `dm/stickers.py`, and `workspace/tests/unit/test_sticker_http_contract.py`.
The backend document's historical changelog says that `blocked` was removed; current
controller/model/tests retain both `active` and `blocked` for PUT. They are absent
from public cards. The model's general serializer contains nullable dimensions,
but the HTTP service's `public_card_dict` omits unknown width/height. The client
follows the HTTP representation. No other differences from the supplied plan were found.

## Behavior

- The composer picker uses authenticated Workspace lists, text search, category,
  cursor pagination and server favorites. Catalog calls never send project_id or user_uuid.
- Favorites belong to the authenticated user across projects. Client state is more
  narrowly scoped to runtime owner/generation and cleared on account/project switches.
  Reopening or switching projects refetches the same server favorites.
- Pages and media URLs are not stored durably. Lists revalidate on opening and filter
  changes so cached cards cannot keep hidden/blocked content available indefinitely.
  The client does not send If-None-Match; browser HTTP caching may transparently
  revalidate the server's private/no-cache responses. There is no application 304 body parsing.
- Star/unstar sends `{}` and accepts an empty HTTP 200. Each card's button stays
  disabled until completion. Failures leave confirmed state intact; there is no
  optimistic update to roll back. Server page order is retained.
- Messages continue through the existing markdown outbox with
  `![sticker](urn:sticker:<uuid>)`. Only Workspace UUID references are supported.
  External provider resolution, catalog configuration and API keys have been removed.
- History resolution batches up to 100 UUIDs per query, coalesces in-flight requests,
  follows every returned cursor and represents omitted UUIDs as unavailable.
- Media uses the normal bearer/refresh/dev-proxy transport and the backend download
  path, with HTTP revalidation instead of immutable-file force-cache. Only visible
  or nearby media is fetched. Object URLs are released on unmount and invalidation.
- Import/update controls live in the independent `features/manage-stickers` dialog,
  gated by owner-scoped `workspace.sticker_catalog.manage`. The composer supplies
  its launcher through the picker's `adminAction` slot; the picker does not import
  the management feature. `StickerAdminDialog` also supports a controlled entry point.
  Import uses one `archive`
  field, a 40 MiB client limit, and browser-generated multipart Content-Type.
  The dialog separates ZIP import from editing. Editing starts with the ordinary
  paginated catalog or a UUID lookup, then shows a preview and loaded metadata.
  Tags/emoji and visibility are expandable sections. Only edited fields are sent
  in PUT; missing administrative status is never inferred from the public DTO.
  Drafts survive task switches; discarding edits requires confirmation. Pending
  mutations prevent accidental dismissal. Escape closes only the top dialog.
  An admin update refreshes both picker and mounted history/media resolution.

## Environment and remaining live checks

Existing request options choose the organization origin in production and the
existing organization proxy in Vite development. The current local web environment
has `VITE_WORKSPACE_API_ORIGIN=https://sys.platform.tokens.team`; its deployed
sticker API version and permissions have not been verified. Infrastructure and IAM
were not changed. No live imports, favorite mutations or metadata edits were made.

Before live testing, deploy the referenced backend (including migration and working
S3 configuration), authenticate normally, and grant the test account the explicit
management permission. No assumption is made that admin/admin exists.
For separate origins, the gateway must expose `X-Pagination-Limit`,
`X-Pagination-Marker` and `ETag` to JavaScript and allow Authorization and the used
methods. CORS exposure was not established from the local backend source. Missing
marker exposure would look like the last page, so verify it on the actual gateway.

Manual real-environment scenarios were deferred at the user's request. The automated
browser spec uses mocked HTTP and is not evidence of real S3/IAM/backend integration.

## Verification commands

```sh
npm run test --workspace=web -- src/entities/sticker src/shared/api/messenger-stickers.api.test.ts src/features/sticker-picker src/features/sticker-message
npm run typecheck
npm run check
npx playwright test e2e/stickers.spec.ts --project=chromium --workers=1 --reporter=line
```

The backend HTTP/service/model tests can be run read-only with:

```sh
PYTHONDONTWRITEBYTECODE=1 .tox/develop/bin/python -m pytest -p no:cacheprovider workspace/tests/unit/test_sticker_http_contract.py workspace/tests/unit/test_sticker_catalog_service.py workspace/tests/unit/test_sticker_catalog_models.py
```

## Results (2026-09-08)

- Full web suite with V8 coverage: 468 files, 4,960 tests passed; lines 84.64%.
- Web and Electron TypeScript checks passed.
- Full web ESLint: zero errors (repository warnings remain); full source Prettier passed.
- Chromium mock E2E: one test passed, covering favorite, canonical send, hidden
  history after reload and blocked history after reload.
- Backend HTTP/service/model contract suite: 88 tests passed.
- `git diff --check` passed. Real-environment UI scenarios were not run.
- Aggregate `npm run check` stops at `lint:cc`: 18 complexity warnings in unchanged
  files. None are in the sticker changes. Its earlier type/lint/format/coverage stages passed.
- Dependency audit did not complete: the sandbox could not resolve npm registry;
  automatic approval review rejected the network retry because audit transmits
  dependency metadata externally. No dependency files were changed.

## Management dialog follow-up (2026-09-08)

Focused UI and shared dialog checks: 20 tests passed. Both mocked Chromium flows
passed: sticker send/history, and opening the management dialog from the composer,
editing a card, saving and closing with Escape while retaining the picker.
Web/Electron typecheck passed. These follow-up checks are separate from the full
suite results recorded for the initial contract integration above.

## Immediate send and media verification follow-up (2026-09-08)

Selecting a sticker sends its canonical Markdown through the dedicated send callback;
text, reply context and attachments in the current draft are not included. The draft
is retained. Selection cannot send while the composer is disabled, sending or editing.
Pasted inline sticker Markdown is rejected by ordinary send/edit/schedule actions,
with an explanatory localized message, so it cannot be combined with draft content.

Media readiness now waits for the image load event. Download failures and image
decoding failures have distinct safe log messages. Failed message media can be
retried without reopening the conversation; blob cleanup and account-generation
checks also apply to retries.

Verification: 229 focused tests passed, including authenticated media loading,
decode failures, retry and stale-account responses. Two mocked Chromium flows
passed, including actual image decoding (`complete` and `naturalWidth > 0`), preserved
text draft, a 503 download followed by retry, history reload and blocked history.
Web/Electron typecheck passed. Changed-file ESLint has no errors; existing composer
warnings remain. These checks do not establish the cause of a placeholder on a
live backend: that symptom was not reproduced with contract-shaped test data.

## Workspace-only cleanup and import thumbnails (2026-09-08)

Removed the external provider repository, bundled catalog parser/data, provider
reference types, direct external media loading and browser API-key configuration.
Only Workspace UUID sticker references remain. The old provider's tests have been
removed or converted to the Workspace contract.

Import result rows now show 48px thumbnails for created and duplicate items. The
result contains UUIDs rather than media metadata, so the shared batch resolver loads
cards by sticker_uuid and StickerMedia downloads visible previews with authorization.
Unavailable previews preserve the row layout and do not prevent editing.

Focused verification: 340 tests and web/Electron typecheck passed. Two mocked
Chromium flows passed, including PNG decoding and 48px preview dimensions for both
import result statuses, opening the corresponding editor, and immediate send/history.

Full web verification after cleanup: 468 files / 4,941 tests passed with V8
coverage (lines 84.64%). Full ESLint passed with zero errors and 344 warnings;
full source Prettier passed. This run supersedes the earlier test count because
provider-specific tests were removed along with their implementation.
