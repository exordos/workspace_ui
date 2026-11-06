import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { subscribeRealChatKeyChanges } from "~/entities/messenger/chat-crypto-resources.lib";
import type { RealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { StoredChatKeyMetadata } from "~/entities/messenger/chat-key-storage.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { formatDateJoined } from "~/shared/lib/datetime.lib";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog";
import { useChatCryptoSession } from "./chat-crypto-session.hook";
import { useEncryptedChatInfo } from "./encrypted-chat-info.hook";
import { EncryptedChatInfo } from "./encrypted-chat-info.ui";
import type {
  EncryptedChatInfoProps,
  EncryptedChatLocalKeyView,
} from "./encrypted-chat-info.types";

function formatLocalKeyDate(receivedAt: number): string | undefined {
  const date = new Date(receivedAt);
  return Number.isNaN(date.getTime()) ? undefined : formatDateJoined(date.toISOString());
}

function useLocalKeyInventory(
  session: RealChatSession | null,
  streamUuid: string,
  enabled: boolean,
) {
  const [inventory, setInventory] = useState<{
    session: RealChatSession;
    streamUuid: string;
    keys: readonly StoredChatKeyMetadata[];
    loading: boolean;
    error: boolean;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (session == null || !enabled) return;
    let disposed = false;
    let sequence = 0;
    const load = () => {
      const request = ++sequence;
      setInventory((previous) => ({
        session,
        streamUuid,
        keys:
          previous?.session === session && previous.streamUuid === streamUuid ? previous.keys : [],
        loading:
          previous?.session === session && previous.streamUuid === streamUuid
            ? previous.loading || previous.error
            : true,
        error: false,
      }));
      void session.listLocalKeys().then(
        (keys) => {
          if (!disposed && request === sequence)
            setInventory({ session, streamUuid, keys, loading: false, error: false });
        },
        () => {
          if (!disposed && request === sequence)
            setInventory({ session, streamUuid, keys: [], loading: false, error: true });
        },
      );
    };
    let scope: RealChatSession["storageScope"];
    try {
      scope = session.storageScope;
    } catch {
      setInventory({ session, streamUuid, keys: [], loading: false, error: true });
      return;
    }
    const ownerKey = workspaceRuntimeOwnerKey(scope.owner);
    const unsubscribe = subscribeRealChatKeyChanges((change) => {
      if (
        change &&
        (change.ownerKey !== ownerKey ||
          change.deviceId !== scope.deviceId ||
          change.streamUuid !== streamUuid)
      )
        return;
      load();
    });
    load();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [session, enabled, refresh, streamUuid]);
  const currentInventory =
    session != null && inventory?.session === session && inventory.streamUuid === streamUuid
      ? inventory
      : null;
  return { inventory: currentInventory, retry: () => setRefresh((value) => value + 1) };
}
function localKeyViews(
  keys: readonly StoredChatKeyMetadata[],
  currentKeyUuid: string | undefined,
  announcementDates: Readonly<Record<string, string>>,
): readonly EncryptedChatLocalKeyView[] {
  const localKeys = keys
    .map((key) => {
      const announcement = announcementDates[key.keyUuid];
      return {
        keyUuid: key.keyUuid,
        isCurrent: key.keyUuid === currentKeyUuid,
        addedLabel:
          key.receivedAt == null
            ? t("e2ee.localKeyDateUnknown")
            : (formatLocalKeyDate(key.receivedAt) ?? t("e2ee.localKeyDateUnknown")),
        announcedLabel:
          announcement == null
            ? t("e2ee.localKeyAnnouncementUnknown")
            : (formatDateJoined(announcement) ?? t("e2ee.localKeyAnnouncementUnknown")),
      };
    })
    .sort((first, second) => Number(second.isCurrent) - Number(first.isCurrent));
  return localKeys;
}

function useLocalKeyActions(
  crypto: ReturnType<typeof useChatCryptoSession>,
  streamUuid: string,
  screen: EncryptedChatInfoProps["screen"],
  selectedLocalKeyUuid: string | undefined,
  localKeys: readonly EncryptedChatLocalKeyView[],
  onScreenChange: EncryptedChatInfoProps["onScreenChange"],
) {
  const activeScope = useRef({ session: crypto.session, streamUuid });
  useLayoutEffect(() => {
    activeScope.current = { session: crypto.session, streamUuid };
  }, [crypto.session, streamUuid]);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    session: typeof crypto.session;
    streamUuid: string;
    keyUuid: string;
    failed?: boolean;
  } | null>(null);
  const [requested, setRequested] = useState<{
    session: typeof crypto.session;
    streamUuid: string;
    keyUuid: string;
  } | null>(null);
  const deleteConfirmationOpen =
    deleteConfirmation?.session === crypto.session &&
    deleteConfirmation.streamUuid === streamUuid &&
    screen === "local-key" &&
    deleteConfirmation.keyUuid === selectedLocalKeyUuid &&
    localKeys.some((key) => key.keyUuid === deleteConfirmation.keyUuid);
  const requestKey = (keyUuid: string) => {
    const submittedSession = crypto.session;
    void crypto.requestKey(keyUuid).then((success) => {
      if (
        success &&
        activeScope.current.session === submittedSession &&
        activeScope.current.streamUuid === streamUuid
      )
        setRequested({ session: submittedSession, streamUuid, keyUuid });
    });
  };
  return {
    requestKey,
    requestedKeyUuid:
      requested?.session === crypto.session && requested.streamUuid === streamUuid
        ? requested.keyUuid
        : undefined,
    confirmDelete: (keyUuid: string) =>
      setDeleteConfirmation({ session: crypto.session, streamUuid, keyUuid }),
    dialog: (
      <AppDialog
        open={deleteConfirmationOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmation(null);
        }}
        title={t("e2ee.deleteLocalKeyConfirmTitle")}
        description={t("e2ee.deleteLocalKeyConfirmDescription")}
        footer={
          <AppDialogFormFooter
            cancelLabel={t("common.cancel")}
            submitLabel={t("e2ee.deleteLocalKey")}
            onCancel={() => setDeleteConfirmation(null)}
            submitDisabled={crypto.session == null || !deleteConfirmationOpen}
            isSubmitting={crypto.state.pending}
            onSubmit={() => {
              const submitted = deleteConfirmation;
              if (submitted == null || !deleteConfirmationOpen) return;
              void crypto.removeLocalKey(submitted.keyUuid).then((success) => {
                if (!success) {
                  setDeleteConfirmation((latest) =>
                    latest === submitted ? { ...latest, failed: true } : latest,
                  );
                  return;
                }
                setDeleteConfirmation((latest) => (latest === submitted ? null : latest));
                // A completion from an old session must not navigate the active drawer.
                if (
                  submitted.session === activeScope.current.session &&
                  submitted.streamUuid === activeScope.current.streamUuid
                )
                  onScreenChange?.("key");
              });
            }}
          />
        }
      >
        {deleteConfirmationOpen && deleteConfirmation?.failed ? (
          <p role="alert" className="text-sm text-danger">
            {crypto.error ?? t("e2ee.deleteLocalKeyFailed")}
          </p>
        ) : null}
      </AppDialog>
    ),
  };
}

function currentKeyInfo(
  keyUuid: string | undefined,
  createdAt: string | undefined,
): EncryptedChatInfoProps["keyInfo"] {
  if (keyUuid == null) return null;
  return {
    name: keyUuid,
    createdLabel:
      createdAt == null ? undefined : t("e2ee.keyCreatedAt", { date: formatDateJoined(createdAt) }),
  };
}

export function EncryptedChatInfoConnected({
  streamUuid,
  onClose,
  onCall,
  renderAvatar,
  screen = "info",
  onScreenChange,
  selectedLocalKeyUuid,
  onOpenLocalKey,
  onAddMember,
  onRemoveMember,
  removableMemberIds,
  removingMemberIds,
  removeMemberError,
}: {
  readonly streamUuid: string;
  readonly screen?: EncryptedChatInfoProps["screen"];
  readonly onScreenChange?: EncryptedChatInfoProps["onScreenChange"];
  readonly selectedLocalKeyUuid?: string;
  readonly onOpenLocalKey?: EncryptedChatInfoProps["onOpenLocalKey"];
  readonly onAddMember?: EncryptedChatInfoProps["onAddMember"];
  readonly onRemoveMember?: EncryptedChatInfoProps["onRemoveMember"];
  readonly removableMemberIds?: EncryptedChatInfoProps["removableMemberIds"];
  readonly removingMemberIds?: EncryptedChatInfoProps["removingMemberIds"];
  readonly removeMemberError?: EncryptedChatInfoProps["removeMemberError"];
  readonly onClose?: () => void;
  readonly onCall?: () => void;
  readonly renderAvatar?: EncryptedChatInfoProps["renderAvatar"];
}) {
  const crypto = useChatCryptoSession(streamUuid);
  const { projection, onCopyKey } = useEncryptedChatInfo(streamUuid, crypto.sendKeyUuid ?? null);
  // Scope transient presentation to the exact session so navigation cannot carry a confirmation.
  const [confirmation, setConfirmation] = useState<{
    session: typeof crypto.session;
    keyUuid: string;
    failed?: boolean;
  } | null>(null);
  const { inventory: currentInventory, retry: retryInventory } = useLocalKeyInventory(
    crypto.session,
    streamUuid,
    screen === "key" || screen === "local-key",
  );
  const localKeys = localKeyViews(
    currentInventory?.keys ?? [],
    projection?.stream.encryption === true
      ? projection.stream.currentEncryptionKey?.keyUuid
      : (crypto.sendKeyUuid ?? undefined),
    projection?.keyAnnouncementDates ?? {},
  );
  const localActions = useLocalKeyActions(
    crypto,
    streamUuid,
    screen,
    selectedLocalKeyUuid,
    localKeys,
    onScreenChange,
  );
  if (projection == null)
    return (
      <p role="status" className="p-4 text-sm text-text-muted">
        {t("workspaceMessenger.runtimeUnavailable")}
      </p>
    );
  const { stream, keyCreatedAt, requests: loadedRequests, members, onlineCount } = projection;
  const currentKey =
    stream.encryption === true
      ? stream.currentEncryptionKey
      : crypto.sendKeyUuid
        ? { keyUuid: crypto.sendKeyUuid }
        : null;
  const outcomes = crypto.session?.getKeyRequestOutcomes() ?? [];
  const requestsFor = (status: "pending" | "granted" | "rejected") => {
    const ids = new Set(
      outcomes
        .filter(
          (outcome) =>
            outcome.status === status &&
            crypto.session?.canRespondToKeyRequest(outcome.request.uuid) === true,
        )
        .map((outcome) => outcome.request.uuid),
    );
    return loadedRequests
      .filter((request) => ids.has(request.requestMessageUuid))
      .map((request) => ({
        ...request,
        pending: crypto.state.pending,
        canGrant: crypto.session?.canGrantKey(request.requestMessageUuid) === true,
        canReject: crypto.session?.canRejectKey(request.requestMessageUuid) === true,
      }));
  };
  const requests = requestsFor("pending");
  const confirmationOpen =
    confirmation?.session === crypto.session && confirmation.keyUuid === currentKey?.keyUuid;
  return (
    <>
      <EncryptedChatInfo
        title={stream.name}
        color={stream.color}
        screen={screen}
        description={stream.description}
        channelTypeLabel={t(stream.isPrivate ? "channel.typeClosedProtected" : "channel.typeOpen")}
        onScreenChange={onScreenChange}
        onOpenSettings={onScreenChange == null ? undefined : () => onScreenChange("settings")}
        participantsCount={members.length}
        onlineCount={onlineCount}
        keyInfo={currentKeyInfo(currentKey?.keyUuid, keyCreatedAt)}
        selectedLocalKeyUuid={selectedLocalKeyUuid}
        onOpenLocalKey={onOpenLocalKey}
        localKeys={localKeys}
        localKeysLoading={
          crypto.session != null && (currentInventory == null || currentInventory.loading)
        }
        localKeysError={currentInventory?.error ? t("e2ee.localKeysLoadFailed") : null}
        onRetryLocalKeys={retryInventory}
        currentKeyMissing={
          currentKey != null &&
          currentInventory != null &&
          !currentInventory.loading &&
          !currentInventory.error &&
          !localKeys.some((key) => key.keyUuid === currentKey.keyUuid)
        }
        canRequestKey={
          stream.encryption === true && crypto.session?.getRights().canRequest === true
        }
        requestedKeyUuid={localActions.requestedKeyUuid}
        onRequestKey={localActions.requestKey}
        onDeleteLocalKey={crypto.session == null ? undefined : localActions.confirmDelete}
        requests={requests}
        grantedRequests={requestsFor("granted")}
        rejectedRequests={requestsFor("rejected")}
        requestsLabel={t("e2ee.requestsTitle", { count: requests.length })}
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
        onAddMember={onAddMember}
        onRemoveMember={onRemoveMember}
        removableMemberIds={removableMemberIds}
        removingMemberIds={removingMemberIds}
        removeMemberError={removeMemberError}
        renderAvatar={renderAvatar}
        onClose={onClose}
        onCall={onCall}
        onCopyKey={currentKey == null ? undefined : onCopyKey}
      />
      {localActions.dialog}
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
              const submitted = confirmation;
              if (submitted == null || !confirmationOpen) return;
              void crypto.reissueKey().then((success) => {
                setConfirmation((latest) => {
                  if (latest !== submitted) return latest;
                  return success ? null : { ...latest, failed: true };
                });
              });
            }}
            submitDisabled={crypto.session?.getRights().canRotate !== true}
            isSubmitting={crypto.state.pending}
          />
        }
      >
        {confirmation?.failed ? (
          <p role="alert" className="text-sm text-danger">
            {crypto.error ?? t("e2ee.rotateKeyFailed")}
          </p>
        ) : null}
      </AppDialog>
    </>
  );
}
