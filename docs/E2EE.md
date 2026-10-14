# Encrypted chats

Current for the client implementation on this branch as of 2026-10-08. This is a reference to implemented code, not a development plan or confirmation of production deployment. Related issue: [workspace_ui #177](https://github.com/exordos/workspace_ui/issues/177).

## Capabilities

- Create a stream with `encryption: true`, generating and durably storing the creator's key before the network request.
- Send encrypted text and read history after reload when the local key is available. Messages without a key remain locked; decryption errors allow retrying and requesting the message's key.
- Request a current or historical generation's key; grant, reject, or grant in bulk with individual request outcomes. Owners and administrators can grant and reject requests; granting requires the requested generation's local key.
- Rotate the key as the owner, with confirmation: a new generation does not rewrite existing history. Participants request the new key themselves.
- View local keys and delete a selected key with confirmation. Deletion removes available plaintext from mounted messages and notifies other tabs.
- Until the current key is received, sending can use the last available local key and its UUID. Receiving the current key automatically switches subsequent sends; sending is unavailable when no keys are available.

Ordinary Markdown send/edit/forward operations and saving ordinary server drafts are blocked for encrypted chats. Text and attachment references are encrypted together in the message. Attachments use the existing Workspace file upload flow; their bytes and file metadata are not E2EE-encrypted. Failed encrypted sends retain the editor text and uploaded attachments for retry. Converting an existing chat to encrypted mode and automatically granting keys to a new device are not implemented by this flow.

Decrypted attachment references use the existing inline image/video previews and file download actions. Locking a message after local key deletion or an owner change removes inline previews, aborts their pending loads, and releases their display URLs. Plaintext references remain in scoped presentation memory; the message store retains the encrypted payload. Deleting a chat key does not revoke access to unencrypted media already opened in the viewer, downloaded files, or previously learned file references.

## Ownership and source map

| Responsibility                                                                  | Source                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key generation and encryption of messages and grants                            | [Provider](../packages/web/src/entities/messenger/chat-real-crypto-provider.lib.ts), [its contract](../packages/web/src/entities/messenger/chat-crypto-provider.types.ts)                                                  |
| Secrets, pending requests, and atomic operation completion                      | [IndexedDB storage](../packages/web/src/entities/messenger/chat-key-storage-idb.lib.ts), [contract](../packages/web/src/entities/messenger/chat-key-storage.types.ts)                                                      |
| Initial key and chat creation                                                   | [Bootstrap](../packages/web/src/entities/messenger/chat-real-key-bootstrap.lib.ts), [create actions](../packages/web/src/entities/messenger/messenger-create-chat-actions.lib.ts)                                          |
| Permissions, requests, and responses for one generation                         | [Controller](../packages/web/src/entities/messenger/chat-e2ee-controller.lib.ts)                                                                                                                                           |
| Generations, rotation, sending key, and reconciliation with the messenger store | [Runtime](../packages/web/src/entities/messenger/chat-crypto-runtime.lib.ts)                                                                                                                                               |
| Shared page/drawer session, acquisition/release, and ingestion deduplication    | [Session manager](../packages/web/src/entities/messenger/chat-crypto-session.lib.ts)                                                                                                                                       |
| React integration and key panel                                                 | [Session hook](../packages/web/src/features/encrypted-chat-info/chat-crypto-session.hook.ts), [connected panel](../packages/web/src/features/encrypted-chat-info/encrypted-chat-info-connected.ui.tsx)                     |
| Decryption for presentation only                                                | [Presentation hook](../packages/web/src/features/encrypted-chat-message/real-message-presentation.hook.ts), [message bubble](../packages/web/src/widgets/workspace-message-list/workspace-encrypted-message-bubble.ui.tsx) |

The messenger store owns the stream, current key UUID, and roles. The session does not fetch them through a separate HTTP flow; it relies on shared bootstrap and participant loading. The page and drawer share a session for the same owner/runtime generation/stream; the final consumer releases it. A generation change preserves the session and editor text. Session state notifications are separate from key change notifications.

## Wire contract and cryptography

Exact DTOs and validation are in [messenger.types.ts](../packages/web/src/shared/api/messenger.types.ts); byte conversion is in the [payload adapter](../packages/web/src/entities/messenger/chat-e2ee-payload-adapters.lib.ts). The client expects `current_encryption_key_uuid`. Messages use `e2ee`, `key_request`, `key_grant`, `key_reject`, and `key_announced`; an announcement contains only `kind` and `key_uuid`.

`key_uuid` addresses a generation of a random 32-byte symmetric `GroupKey`; it is not its fingerprint. `key_request.public_key` is the public X25519 key of an individual request. `e2ee.content` and `key_grant.content` contain binary envelopes encoded as standard padded Base64. `GroupKey` and private request keys are never sent to the backend in plaintext. The composer checks the 40,000-character plaintext limit before encryption. The backend validates the final opaque payload size; failed sends preserve the composer text.

The provider defines the format; library versions belong to [package.json](../packages/web/package.json) and the lockfile.

- Message envelopes are random salt32 + ChaCha20-Poly1305 ciphertext/tag16, without a magic prefix or framing-version byte. The reader supports only this format; previous test messages are not migrated. HKDF-SHA256 derives a separate key32 from `GroupKey`, the salt, and the UTF-8 JSON array `["workspace-chat-crypto-v1", "message", streamUuid, keyUuid]`. The nonce is 12 zero bytes; each operation uses a fresh salt and derived key. AAD consists of the array's bytes followed by the salt.
- Grant: `WSCG` + version byte `1` + HPKE `enc32` + ciphertext48 containing `GroupKey` and the tag. HPKE Base uses DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, and ChaCha20-Poly1305. `info` is UTF-8 JSON `["workspace-chat-crypto-v1", "grant", streamUuid, keyUuid, requestMessageUuid, senderDeviceId, recipientDeviceId]`; AAD consists of `info` followed by magic/version and the request's public key bytes.

This is a client format built on library primitives. Topic, author, local owner, and runtime generation are not part of the message's cryptographic context. Format changes require an explicit compatibility decision for persisted history.

## Storage and recovery

Secrets are stored separately from the message cache in IndexedDB `workspace-chat-secrets-v1`. A key address includes owner, device, stream, and key UUID; runtime generation guards live operations rather than forming part of the durable address. Device ID and name are durable metadata; there is no permanent asymmetric device key pair.

The X25519 pair and canonical request UUID (`localRequestId`) are persisted before POST. The backend returns a public placement UUID, derived as UUIDv5(topic UUID, canonical UUID); this binds `requestMessageUuid` and is referenced by grants and rejections. Retrying always sends the canonical UUID again. Own history can restore an unbound request or repair an older canonical binding after checking its author, device, generation, and public key. Closing the page does not delete its secret, and there is no TTL. A verified grant atomically stores `GroupKey`, records a receipt, and deletes the private request key. A rejection completes only the corresponding request. The controller checks author, permissions, generation, request UUID, and recipient device; history and realtime messages can arrive repeatedly or out of order.

Creation and rotation use durable staging; retrying after a lost response retains the prepared secret and operation UUID. Historical messages always select their exact `key_uuid`. Async guards prevent an old owner/runtime from writing results into a new session. Persistent storage failure is not silently replaced with temporary storage.

## Security boundaries

- Attachment bytes and file metadata are stored without E2EE. Only their Markdown references inside the message are encrypted. The existing file API checks stream membership; E2EE does not protect the stored file from the server or storage access. The protected-chat label in the header includes a small information icon and explains this boundary and the need for a local chat key on hover or keyboard focus.
- Account authorship and roles are trusted as backend data. HPKE Base does not independently authenticate the sender; device ID is an addressing label, not proof of identity. A UUID does not independently verify the expected `GroupKey`.
- A shared key does not provide forward secrecy, cryptographic proof of an individual participant's authorship, or revocation of previously granted secrets. Rotation does not revoke access to old history or messages sent with an old key.
- The client does not serialize rotation across devices; live scope checks do not guarantee resolution of conflicts between devices. If an intermediate generation stops being current before the operation completes, its staged secret does not automatically become an available historical key.
- IndexedDB is not hardware-backed storage: code running in the origin and access to the device can expose secrets. Key export/import and backup are not implemented. Losing every copy of a key makes that generation's history inaccessible.
- Metadata, participants, and service messages are not hidden. Plaintext exists in presentation/editor memory and passes through the existing safe renderer; the store/cache retain ciphertext. This flow does not provide encrypted push notifications or server-side plaintext search.
- Old mock envelopes are not migrated automatically. The DEV mock and insecure sandbox have been removed; only the [static UI preview](../packages/web/src/pages/encrypted-chat/encrypted-chat-preview.ui.tsx) remains.

## Verification and integration

Regression tests live alongside the provider, storage, controller, runtime, and session hook. The [Chromium E2E test](../e2e/workspace-local-keys.spec.ts) checks the local key manager using real client cryptography and a mock API. Commands are in [Project Facts](PROJECT_FACTS.md#verification); general security boundaries are in [Security architecture](SECURITY_ARCHITECTURE.md).

The client flow is implemented. Current automated checks do not confirm a complete live UUID-only flow with independent devices or a native Electron smoke test. Deployed backend support must be verified separately against the [contract sources](PROJECT_FACTS.md#backend-contracts): the local PR180 test environment is not a production migration.

Previous drafts and plans have been removed from active documentation; Git retains the history of decisions and local verification.
