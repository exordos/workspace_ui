import { useMemo } from "react";
import { encryptedMessageLabel } from "~/applications/messenger/features/decrypted-message/encrypted-chat-message/encrypted-message-label.lib";
import { useMessagePresentation } from "~/applications/messenger/features/decrypted-message/message-presentation.hook";
import { useKnownMessage } from "~/applications/messenger/model/messages/messages-consumers";
import type { MessengerSidebarMessagePreview } from "~/applications/messenger/model/messenger.types";
import { useTranslation } from "~/i18n/i18n";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { summarizeWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";

function EncryptedSidebarMessagePreview({
  preview,
}: Readonly<{ preview: MessengerSidebarMessagePreview }>) {
  const message = useKnownMessage(preview.messageUuid);
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
  if (
    message !== null &&
    message.payload.kind !== "e2ee" &&
    message.payload.kind !== "markdown" &&
    message.payload.kind !== "poll"
  ) {
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
