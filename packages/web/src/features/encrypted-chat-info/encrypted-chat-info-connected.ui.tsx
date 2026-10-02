import { t } from "~/i18n/i18n";
import { useEncryptedChatInfo } from "./encrypted-chat-info.hook";
import { EncryptedChatInfo } from "./encrypted-chat-info.ui";
import type { EncryptedChatInfoProps } from "./encrypted-chat-info.types";

export function EncryptedChatInfoConnected({
  streamUuid,
  onClose,
  renderAvatar,
}: {
  readonly streamUuid: string;
  readonly onClose?: () => void;
  readonly renderAvatar?: EncryptedChatInfoProps["renderAvatar"];
}) {
  const { projection, onCopyKey, copyError } = useEncryptedChatInfo(streamUuid);
  if (projection == null)
    return (
      <p role="status" className="p-4 text-sm text-text-muted">
        {t("workspaceMessenger.runtimeUnavailable")}
      </p>
    );
  const { stream, keyCreatedAt, requests, members, onlineCount } = projection;
  const currentKey = stream.currentEncryptionKey;
  return (
    <EncryptedChatInfo
      title={stream.name}
      showHeader={false}
      participantsCount={members.length}
      onlineCount={onlineCount}
      keyInfo={
        currentKey == null
          ? null
          : {
              name: currentKey.keyUuid,
              createdLabel:
                keyCreatedAt == null ? undefined : t("e2ee.keyCreatedAt", { date: keyCreatedAt }),
            }
      }
      requests={requests}
      requestsLabel={t("e2ee.loadedRequestsTitle", { count: requests.length })}
      unavailableReason={t("e2ee.keyActionsUnavailable")}
      members={members}
      renderAvatar={renderAvatar}
      error={copyError}
      onClose={onClose}
      onCopyKey={currentKey == null ? undefined : onCopyKey}
    />
  );
}
