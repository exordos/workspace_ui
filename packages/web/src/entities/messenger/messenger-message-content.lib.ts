import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { decryptRealChatMessageResult } from "./chat-crypto-runtime.lib";
import type { MessengerMessage, MessengerStream } from "./messenger.types";

export type MessengerMessageContent =
  | { readonly status: "ready"; readonly kind: "markdown"; readonly markdown: string }
  | {
      readonly status: "ready";
      readonly kind: "service";
      readonly payload: Exclude<MessengerMessage["payload"], { kind: "markdown" | "e2ee" }>;
    }
  | { readonly status: "missing-key" }
  | { readonly status: "error"; readonly canRequestKey?: boolean };

/** Metadata updates do not change content identity; edited envelopes always do. */
export function getMessengerMessageContentKey(message: MessengerMessage): string {
  return JSON.stringify([message.projectId, message.streamUuid, message.uuid, message.payload]);
}

export function getImmediateMessengerMessageContent(
  message: MessengerMessage,
): Extract<MessengerMessageContent, { status: "ready" }> | null {
  const payload = message.payload;
  switch (payload.kind) {
    case "markdown":
      return { status: "ready", kind: "markdown", markdown: payload.content };
    case "e2ee":
      return null;
    case "key_announced":
    case "key_request":
    case "key_grant":
    case "key_reject":
      return { status: "ready", kind: "service", payload };
  }
}

/** Native chats can contain encrypted payloads without encrypting the whole channel. */
export function canPrepareMessengerEncryptedMessage({
  runtime,
  message,
  catalogOwner,
  messageOwner,
  stream,
}: {
  readonly runtime: WorkspaceRuntimeContext | null;
  readonly message: MessengerMessage;
  readonly catalogOwner: string | null;
  readonly messageOwner: string | null;
  readonly stream: MessengerStream | undefined;
}): boolean {
  if (runtime == null || message.payload.kind !== "e2ee") return false;
  const owner = workspaceRuntimeOwnerKey(runtime);
  return (
    catalogOwner === owner &&
    messageOwner === owner &&
    message.projectId === runtime.projectId &&
    stream?.uuid === message.streamUuid &&
    stream.projectId === runtime.projectId &&
    stream.userUuid === runtime.userUuid &&
    (stream.encryption === true || stream.sourceName === "native")
  );
}

/** Prepared text is returned to its caller, never projected into canonical messages or cache. */
export async function prepareMessengerMessageContent(
  runtime: WorkspaceRuntimeContext,
  message: MessengerMessage,
  isCurrent: () => boolean,
): Promise<MessengerMessageContent> {
  const immediate = getImmediateMessengerMessageContent(message);
  if (immediate != null) return immediate;
  if (!isCurrent()) return { status: "missing-key" };
  try {
    const result = await decryptRealChatMessageResult(runtime, message, isCurrent);
    if (!isCurrent()) return { status: "missing-key" };
    return result.status === "ready"
      ? { status: "ready", kind: "markdown", markdown: result.plaintext }
      : result;
  } catch {
    return { status: isCurrent() ? "error" : "missing-key" };
  }
}
