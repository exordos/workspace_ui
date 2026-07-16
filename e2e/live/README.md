# Live Messenger E2E

`messenger-contract-live.spec.ts` exercises the public Messenger contract against an isolated
deployment with six local accounts. It opens one visible browser context per account and does not
hardcode or log credentials or infrastructure details.

Required environment variables:

```text
TEST_MESSENGER_SERVER
TEST_MESSENGER_OWNER_EMAIL
TEST_MESSENGER_OWNER_PASSWORD
TEST_MESSENGER_ADMINISTRATOR_EMAIL
TEST_MESSENGER_ADMINISTRATOR_PASSWORD
TEST_MESSENGER_MODERATOR_EMAIL
TEST_MESSENGER_MODERATOR_PASSWORD
TEST_MESSENGER_MEMBER_EMAIL
TEST_MESSENGER_MEMBER_PASSWORD
TEST_MESSENGER_GUEST_EMAIL
TEST_MESSENGER_GUEST_PASSWORD
TEST_MESSENGER_OUTSIDER_EMAIL
TEST_MESSENGER_OUTSIDER_PASSWORD
```

`TEST_MESSENGER_UI_BASE_URL` is optional and defaults to `http://localhost:5173`.

Run with a visible Chromium window:

```bash
npm run e2e:messenger-live:headed
```

The suite creates uniquely named `cassi-e2e-*` resources and removes them in `finally`. The target
must be an isolated test environment: the scenario creates streams, topics, messages, reactions,
folders, folder items, and S3-backed file, image, and video objects. It verifies role visibility,
outsider isolation, group and direct messages, editing, deletion, read state, folder pin/unpin,
literal `urn:file`, `urn:image`, and `urn:video` round-trips, realtime delivery, epoch catch-up after
an offline interval, and reload persistence.

The file test intentionally sends only Workspace URNs in Markdown. It does not create or require
MIME attachments, and it continues to use the existing `/files/` upload and download API.

The assertions follow the greenfield public layout exactly: Messenger resources use
`/api/workspace/v1/messenger`, users and durable catch-up use `/api/workspace/v1`, and realtime uses
`/api/workspace/v1/events/ws`. Collection and mutation responses are asserted as direct contract
arrays and objects. Native rows must preserve `source_name: "native"`, `source: {"kind":"native"}`,
and nullable `provider` and `delivery` projection fields; the test does not accept compatibility
aliases or legacy response wrappers.
