import { t } from "~/i18n/i18n";
import { useChatCryptoSession } from "./chat-crypto-session.hook";
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
  const crypto = useChatCryptoSession(streamUuid);
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
      requests={requests.map((request) => ({
        ...request,
        pending: crypto.state.pending,
        canGrant: crypto.state.access === "ready" && crypto.session?.getRights().canGrant === true,
        canReject: crypto.session?.getRights().canReject === true,
      }))}
      requestsLabel={t("e2ee.loadedRequestsTitle", { count: requests.length })}
      unavailableReason={
        crypto.session === null && !crypto.loading ? t("e2ee.cryptoUnavailable") : undefined
      }
      loading={crypto.loading}
      actionsPending={crypto.state.pending}
      onGrantRequest={(uuid) => {
        void crypto.grantKey(uuid);
      }}
      onRejectRequest={(uuid) => {
        void crypto.rejectKey(uuid);
      }}
      members={members}
      renderAvatar={renderAvatar}
      error={copyError ?? crypto.error}
      onClose={onClose}
      onCopyKey={currentKey == null ? undefined : onCopyKey}
    />
  );
}
