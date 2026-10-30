import { useMemo } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { MessengerSidebarMessagePreview } from "~/entities/messenger/messenger.types";
import { encryptedMessageLabel } from "~/features/encrypted-chat-message/encrypted-message-label.lib";
import { useMessagePresentation } from "~/features/message-presentation/message-presentation.hook";
import { useTranslation } from "~/i18n/i18n";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { summarizeWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";

function EncryptedSidebarMessagePreview({
  preview,
}: Readonly<{ preview: MessengerSidebarMessagePreview }>) {
  const message = useWorkspaceMessageStore(
    (state) => state.messagesById[preview.messageUuid] ?? null,
  );
  const presentation = useMessagePresentation(message);
  const { t } = useTranslation();
  const plaintext =
    presentation?.status === "ready" && presentation.kind === "markdown"
      ? presentation.markdown
      : null;
  const document = useMemo(
    () => (plaintext === null ? null : parseWorkspaceMessageBody(plaintext)),
    [plaintext],
  );
  let text =
    document === null ? t("e2ee.lockedTitle") : summarizeWorkspaceMessageBody(document).text;
  if (message !== null && message.payload.kind !== "e2ee" && message.payload.kind !== "markdown") {
    text = encryptedMessageLabel(message.payload);
  } else if (presentation?.status === "preparing") {
    text = t("e2ee.messageDecrypting");
  } else if (presentation?.status === "error") {
    text = t("e2ee.messageDecryptError");
  }
  return <SidebarMessagePreview senderName={preview.senderName} message={text} />;
}

/** Resolve encrypted previews locally without changing canonical messages or durable cache. */
export function WorkspaceSidebarMessagePreview({
  preview,
}: Readonly<{ preview: MessengerSidebarMessagePreview | null }>) {
  if (preview?.encrypted === true) return <EncryptedSidebarMessagePreview preview={preview} />;
  return <SidebarMessagePreview senderName={preview?.senderName} message={preview?.text} />;
}
