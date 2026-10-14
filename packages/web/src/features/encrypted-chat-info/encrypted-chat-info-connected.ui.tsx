import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RealChatSession } from "~/entities/messenger/chat-crypto-runtime.lib";
import type { StoredChatKeyMetadata } from "~/entities/messenger/chat-key-storage.types";
import { t } from "~/i18n/i18n";
import { formatDateJoined } from "~/shared/lib/datetime.lib";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";
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
    const unsubscribe = session.subscribe(load);
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
                if (!success) return;
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
        {crypto.error ? (
          <p role="alert" className="text-sm text-danger">
            {crypto.error}
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
  renderAvatar,
  screen = "info",
  onScreenChange,
  selectedLocalKeyUuid,
  onOpenLocalKey,
  onAddMember,
}: {
  readonly streamUuid: string;
  readonly screen?: EncryptedChatInfoProps["screen"];
  readonly onScreenChange?: EncryptedChatInfoProps["onScreenChange"];
  readonly selectedLocalKeyUuid?: string;
  readonly onOpenLocalKey?: EncryptedChatInfoProps["onOpenLocalKey"];
  readonly onAddMember?: EncryptedChatInfoProps["onAddMember"];
  readonly onClose?: () => void;
  readonly renderAvatar?: EncryptedChatInfoProps["renderAvatar"];
}) {
  const { projection, onCopyKey, copyError } = useEncryptedChatInfo(streamUuid);
  const crypto = useChatCryptoSession(streamUuid);
  // Scope transient presentation to the exact session so navigation cannot carry a confirmation.
  const [confirmation, setConfirmation] = useState<{
    session: typeof crypto.session;
    keyUuid: string;
  } | null>(null);
  const { inventory: currentInventory, retry: retryInventory } = useLocalKeyInventory(
    crypto.session,
    streamUuid,
    screen === "key" || screen === "local-key",
  );
  const localKeys = localKeyViews(
    currentInventory?.keys ?? [],
    projection?.stream.currentEncryptionKey?.keyUuid,
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
        canRequestKey={crypto.session?.getRights().canRequest === true}
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
        renderAvatar={renderAvatar}
        error={copyError ?? crypto.error}
        onClose={onClose}
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
              void crypto.reissueKey().then((success) => {
                if (success) setConfirmation((latest) => (latest === submitted ? null : latest));
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
