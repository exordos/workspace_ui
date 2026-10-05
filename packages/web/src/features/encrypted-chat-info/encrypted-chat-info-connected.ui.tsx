import { useState } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
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
  // Scope transient presentation to the exact session so navigation cannot carry a confirmation.
  const [keyViewSession, setKeyViewSession] = useState<typeof crypto.session>(null);
  const [confirmation, setConfirmation] = useState<{
    session: typeof crypto.session;
    keyUuid: string;
  } | null>(null);
  if (projection == null)
    return (
      <p role="status" className="p-4 text-sm text-text-muted">
        {t("workspaceMessenger.runtimeUnavailable")}
      </p>
    );
  const { stream, keyCreatedAt, requests: loadedRequests, members, onlineCount } = projection;
  const currentKey = stream.currentEncryptionKey;
  const outcomes = crypto.session?.getKeyRequestOutcomes() ?? [];
  const requestsFor = (status: "pending" | "granted" | "rejected") => {
    const ids = new Set(
      outcomes
        .filter((outcome) => outcome.status === status)
        .map((outcome) => outcome.request.uuid),
    );
    return loadedRequests
      .filter((request) => ids.has(request.requestMessageUuid))
      .map((request) => ({
        ...request,
        pending: crypto.state.pending,
        canGrant: crypto.session?.canGrantKey(request.requestMessageUuid) === true,
        canReject: crypto.session?.canRejectKey(request.requestMessageUuid) === true,
        error: crypto.requestErrors[request.requestMessageUuid],
      }));
  };
  const requests = requestsFor("pending");
  const confirmationOpen =
    confirmation?.session === crypto.session && confirmation.keyUuid === currentKey?.keyUuid;
  return (
    <>
      <EncryptedChatInfo
        title={stream.name}
        showHeader={false}
        keyView={crypto.session != null && keyViewSession === crypto.session}
        onBack={() => setKeyViewSession(null)}
        onOpenSettings={
          crypto.session == null ? undefined : () => setKeyViewSession(crypto.session)
        }
        participantsCount={members.length}
        onlineCount={onlineCount}
        keyInfo={
          currentKey == null
            ? null
            : {
                name: currentKey.keyFingerprint,
                createdLabel:
                  keyCreatedAt == null ? undefined : t("e2ee.keyCreatedAt", { date: keyCreatedAt }),
              }
        }
        requests={requests}
        grantedRequests={requestsFor("granted")}
        rejectedRequests={requestsFor("rejected")}
        requestsLabel={t("e2ee.loadedRequestsTitle", { count: requests.length })}
        unavailableReason={
          crypto.session === null && !crypto.loading ? t("e2ee.cryptoUnavailable") : undefined
        }
        loading={crypto.loading}
        actionsPending={crypto.state.pending}
        canRotateKey={crypto.session?.getRights().canRotate === true}
        onRotateKey={
          currentKey == null
            ? undefined
            : () => setConfirmation({ session: crypto.session, keyUuid: currentKey.keyUuid })
        }
        canGrantAll={requests.some((request) => request.canGrant)}
        onGrantAll={() => {
          void crypto.grantAllKeys();
        }}
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
      <AppDialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={t("e2ee.rotateConfirmTitle")}
        description={t("e2ee.rotateConfirmDescription")}
        footer={
          <AppDialogFormFooter
            cancelLabel={t("common.cancel")}
            submitLabel={t("e2ee.rotateKey")}
            onCancel={() => setConfirmation(null)}
            onSubmit={() => {
              void crypto.reissueKey().then((success) => {
                if (success) setConfirmation(null);
              });
            }}
            submitDisabled={crypto.session?.getRights().canRotate !== true}
            isSubmitting={crypto.state.pending}
          />
        }
      >
        {crypto.error ? (
          <p role="alert" className="text-sm text-danger">
            {crypto.error}
          </p>
        ) : null}
      </AppDialog>
    </>
  );
}
