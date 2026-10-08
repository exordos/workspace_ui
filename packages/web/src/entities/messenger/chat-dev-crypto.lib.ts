import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import { DEFAULT_MESSENGER_API_BASE } from "~/shared/api/messenger-transport.internal";
import { decodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { DEV_CHAT_KEY_UUID, isDevChatInitialKeyAllowed } from "./chat-initial-key-bootstrap.lib";
import type { ChatCryptoMessageContext, ChatCryptoProvider } from "./chat-crypto-provider.types";
import type { MessengerMessage, MessengerStream } from "./messenger.types";

const TEST_ENVELOPE_TAG = "WORKSPACE_DEV_PLAINTEXT_TEST_V1";
const DEV_CHAT_TEST_GROUP_KEY = "DEV_ONLY_INSECURE_FIXTURE_KEY";

export function canUseDevChatCrypto(
  runtime: WorkspaceRuntimeContext | null,
  stream: MessengerStream | null | undefined,
): boolean {
  return (
    runtime !== null &&
    isDevChatInitialKeyAllowed(runtime) &&
    stream?.encryption === true &&
    stream.projectId === runtime.projectId &&
    stream.userUuid === runtime.userUuid &&
    stream.currentEncryptionKey?.keyUuid === DEV_CHAT_KEY_UUID
  );
}

/** Only the exact local Vite proxy route may carry mock ciphertext. */
export function pinDevChatCryptoRequestOptions(
  runtime: WorkspaceRuntimeContext,
  options: MessengerClientOptions,
): void {
  if (
    !isDevChatInitialKeyAllowed(runtime) ||
    !isDevChatInitialKeyAllowed({
      ...runtime,
      organizationOrigin: options.devTargetOrigin ?? "",
    }) ||
    new URL(options.devTargetOrigin!).origin !== new URL(runtime.organizationOrigin).origin ||
    (options.baseUrl !== undefined && options.baseUrl !== DEFAULT_MESSENGER_API_BASE)
  )
    throw new Error("Development chat crypto unavailable");
  options.baseUrl = DEFAULT_MESSENGER_API_BASE;
  options.devTargetOrigin = new URL(options.devTargetOrigin!).origin;
}

function encodeFixture(plaintext: Uint8Array, context: ChatCryptoMessageContext): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      testOnly: TEST_ENVELOPE_TAG,
      streamUuid: context.streamUuid,
      keyUuid: context.keyUuid,
      text: new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    }),
  );
}

function decodeFixture(bytes: Uint8Array, context: ChatCryptoMessageContext): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (value === null || typeof value !== "object") return null;
    const envelope = value as Record<string, unknown>;
    return envelope.testOnly === TEST_ENVELOPE_TAG &&
      envelope.streamUuid === context.streamUuid &&
      envelope.keyUuid === context.keyUuid &&
      typeof envelope.text === "string"
      ? envelope.text
      : null;
  } catch {
    return null;
  }
}

/** Insecure provider for explicitly marked local test chats. This is encoding, not encryption. */
export function createDevChatCryptoProvider(
  runtime: WorkspaceRuntimeContext,
  stream: MessengerStream,
): ChatCryptoProvider | null {
  if (!canUseDevChatCrypto(runtime, stream)) return null;
  const expectedGroupKey = DEV_CHAT_TEST_GROUP_KEY;
  const groupKey = { bytes: new TextEncoder().encode(expectedGroupKey) };
  const validContext = (context: ChatCryptoMessageContext) =>
    canUseDevChatCrypto(runtime, stream) &&
    context.streamUuid === stream.uuid &&
    context.keyUuid === stream.currentEncryptionKey?.keyUuid;
  return {
    createRequestKeyPair: () => Promise.resolve({ ok: false, reason: "unavailable" }),
    createGroupKey: () => Promise.resolve({ ok: true, value: groupKey }),
    encryptMessage: ({ plaintext, context, groupKey: receivedKey }) => {
      if (
        !validContext(context) ||
        new TextDecoder().decode(receivedKey.bytes) !== expectedGroupKey
      )
        return Promise.resolve({ ok: false, reason: "context-mismatch" });
      try {
        return Promise.resolve({ ok: true, value: { bytes: encodeFixture(plaintext, context) } });
      } catch {
        return Promise.resolve({ ok: false, reason: "invalid-ciphertext" });
      }
    },
    decryptMessage: ({ envelope, context, groupKey: receivedKey }) => {
      if (
        !validContext(context) ||
        new TextDecoder().decode(receivedKey.bytes) !== expectedGroupKey
      )
        return Promise.resolve({ ok: false, reason: "context-mismatch" });
      const text = decodeFixture(envelope.bytes, context);
      return Promise.resolve(
        text === null
          ? { ok: false, reason: "invalid-ciphertext" }
          : { ok: true, value: new TextEncoder().encode(text) },
      );
    },
    encryptGroupKeyGrant: () => Promise.resolve({ ok: false, reason: "unavailable" }),
    decryptGroupKeyGrant: () => Promise.resolve({ ok: false, reason: "unavailable" }),
  };
}

/** The returned text belongs only to local presentation, never message stores or caches. */
export function decodeDevChatMessageForPresentation(
  runtime: WorkspaceRuntimeContext | null,
  stream: MessengerStream | null | undefined,
  message: MessengerMessage,
): string | null {
  if (
    !canUseDevChatCrypto(runtime, stream) ||
    message.streamUuid !== stream?.uuid ||
    message.projectId !== runtime?.projectId ||
    message.payload.kind !== "e2ee" ||
    message.payload.keyUuid !== stream.currentEncryptionKey?.keyUuid
  )
    return null;
  const payload = decodeChatE2eePayload({
    kind: "e2ee",
    key_uuid: message.payload.keyUuid,
    content: message.payload.content,
  });
  return payload.ok && payload.value.kind === "e2ee"
    ? decodeFixture(payload.value.content.bytes, {
        streamUuid: stream.uuid,
        keyUuid: message.payload.keyUuid,
      })
    : null;
}
