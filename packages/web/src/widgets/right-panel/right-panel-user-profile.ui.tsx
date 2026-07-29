import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { runWorkspaceDirectStreamCreate } from "~/entities/messenger/messenger-create-chat-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import {
  resolveUserPresenceVisual,
  selectUserStatusLabel,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import {
  getOwnAvatarCapabilities,
  removeOwnAvatar,
  uploadOwnAvatar,
} from "~/features/user-profile/user-profile.api";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { writeText } from "~/shared/lib/clipboard";
import { createLogger } from "~/shared/lib/logger";
import { isValidRealmUrl, validateFileUpload } from "~/shared/lib/validation";
import {
  parseWorkspaceMessengerRoute,
  workspaceActivityRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator, type PresenceVisual } from "~/shared/ui/presence-indicator";
import { resolvePresenceStatusTextClass } from "~/shared/ui/presence-status-text.lib";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { RightPanelUserProfileActions } from "./right-panel-user-profile-actions.ui";
import { RightPanelUserProfileDetails } from "./right-panel-user-profile-details.ui";
import { resolveDirectProfileChatNavigation } from "./right-panel-user-profile-direct-navigation.lib";
import { RightPanelUserProfileEditAvatarDialog } from "./right-panel-user-profile-edit-avatar-dialog.ui";
import type {
  RightPanelUserProfileProps,
  RightPanelUserProfileResolvedUser,
} from "./right-panel-user-profile.types";

const log = createLogger("right-panel-user-profile");

function resolveProfileUserUuid(
  info: RightPanelUserProfileProps["info"],
): RightPanelUserProfileResolvedUser {
  if (info.kind === "directPrivate") {
    return {
      userUuid: info.directUserUuid,
      title: info.title,
      avatarUrl: info.avatarUrl,
      status: info.status,
      isOwnProfile: info.isOwnProfile,
      details: info.details,
    };
  }

  return {
    userUuid: info.userUuid,
    title: info.title,
    avatarUrl: info.avatarUrl,
    status: info.status,
    isOwnProfile: info.isOwnProfile,
    details: info.details,
  };
}

function resolvePresence(status: RightPanelUserProfileResolvedUser["status"]): PresenceVisual {
  return resolveUserPresenceVisual(status) ?? "offline";
}

function resolveStatusLabel(status: RightPanelUserProfileResolvedUser["status"]): string | null {
  if (status == null) return null;
  if (status === "active") return t("presence.online");
  if (status === "idle") return t("presence.away");
  if (status === "offline") return t("presence.offline");
  return t("presence.doNotDisturb");
}

function buildShareProfileLink(
  organizationOrigin: string | undefined,
  userUuid: string,
): string | null {
  if (organizationOrigin == null || !isValidRealmUrl(organizationOrigin)) return null;
  return `${organizationOrigin.replace(/\/+$/, "")}/#user/${userUuid}`;
}

export const RightPanelUserProfile: React.FC<RightPanelUserProfileProps> = ({
  info,
  onBack,
  headerTitle,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useMemo(() => resolveProfileUserUuid(info), [info]);
  const [isEditing, setIsEditing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [messagePending, setMessagePending] = useState(false);
  // Пока создаём/открываем ЛС перед стартом звонка из чужого профиля
  const [callPending, setCallPending] = useState(false);
  // Модалка смены аватара (Figma Edit avatar) — только в режиме редактирования
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const upsertUser = useUsersStore((state) => state.upsertUser);
  const getUser = useUsersStore((state) => state.getUser);
  // Custom status (emoji + text) — same signal as top-bar / chat header, live from users store.
  const profileUser = useUsersStore((state) => state.usersById[profile.userUuid]);
  const customStatusLabel = useMemo(() => selectUserStatusLabel(profileUser), [profileUser]);
  const resolvedAvatarUrl = profileUser?.avatarUrl ?? profile.avatarUrl;
  const hasAvatar = resolvedAvatarUrl != null && resolvedAvatarUrl.trim().length > 0;
  const currentMessengerRoute = useMemo(
    () => parseWorkspaceMessengerRoute(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    setIsEditing(false);
    setShareCopied(false);
    setAvatarDialogOpen(false);
    setAvatarError(null);
  }, [profile.userUuid]);

  useEffect(() => {
    if (!isEditing) {
      setAvatarDialogOpen(false);
      setAvatarError(null);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!shareCopied) return;
    const timer = window.setTimeout(() => setShareCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  const presence = resolvePresence(profile.status);
  const statusLabel = resolveStatusLabel(profile.status);
  const resolvedHeaderTitle =
    headerTitle?.trim() ||
    (profile.isOwnProfile ? t("settings.personalInfo") : t("info.information"));
  const shareLink = useMemo(
    () => buildShareProfileLink(runtimeContext?.organizationOrigin, profile.userUuid),
    [profile.userUuid, runtimeContext?.organizationOrigin],
  );
  const showActions = !(profile.isOwnProfile && isEditing);
  const actionVariant = profile.isOwnProfile ? "self" : "other";
  const showEditChrome = profile.isOwnProfile && isEditing;

  const handleFavorites = useCallback(() => {
    if (runtimeContext == null) return;
    void navigate(
      workspaceActivityRoute({
        orgId: runtimeContext.organizationId,
        projectId: runtimeContext.projectId,
        filter: "starred",
      }),
    );
  }, [navigate, runtimeContext]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleShare = useCallback(() => {
    if (shareLink == null) return;
    void writeText(shareLink).then((ok) => {
      if (ok) setShareCopied(true);
    });
  }, [shareLink]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Name / nickname cannot be updated via Workspace API yet (IAM-owned, read-only).
  // Save only closes edit chrome until a writable field (e.g. avatar) is wired.
  const handleSaveEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const resolveAvatarMutationError = useCallback(
    (kind: "forbidden" | "invalid" | "unsupported" | "transient", fallback: string): string => {
      if (kind === "unsupported") return t("settings.avatarUnsupported");
      if (kind === "forbidden") return t("settings.avatarChangesDisabled");
      return fallback;
    },
    [],
  );

  const handleOpenAvatarDialog = useCallback(() => {
    setAvatarError(null);
    setAvatarDialogOpen(true);
  }, []);

  const handleTakePhoto = useCallback(() => {
    setAvatarError(null);
    cameraInputRef.current?.click();
  }, []);

  const handleChooseFromGallery = useCallback(() => {
    setAvatarError(null);
    galleryInputRef.current?.click();
  }, []);

  const handleAvatarFileSelected = useCallback(
    (file: File | undefined) => {
      if (file == null || avatarBusy) return;

      const capabilities = getOwnAvatarCapabilities();
      if (capabilities.avatarChangesDisabled) {
        setAvatarError(t("settings.avatarChangesDisabled"));
        return;
      }

      const validation = validateFileUpload(file);
      if (!validation.valid) {
        setAvatarError(
          file.size === 0
            ? t("settings.avatarInvalidFile")
            : t("settings.avatarTooLarge", {
                maxSizeMb: capabilities.maxAvatarFileSizeMib,
              }),
        );
        return;
      }
      if (!file.type.startsWith("image/")) {
        setAvatarError(t("settings.avatarInvalidFile"));
        return;
      }

      setAvatarBusy(true);
      setAvatarError(null);
      void uploadOwnAvatar(file)
        .then((result) => {
          if (!result.ok) {
            setAvatarError(
              resolveAvatarMutationError(result.kind, t("settings.avatarUpdateError")),
            );
            return;
          }

          const existing = getUser(profile.userUuid);
          if (existing != null) {
            upsertUser({
              ...existing,
              avatarUrl: result.avatarUrl,
              updatedAt: new Date().toISOString(),
            });
          }
          setAvatarDialogOpen(false);
        })
        .catch((error) => {
          log.error("Failed to upload own avatar", {
            error: error instanceof Error ? error.message : String(error),
          });
          setAvatarError(t("settings.avatarUpdateError"));
        })
        .finally(() => {
          setAvatarBusy(false);
        });
    },
    [avatarBusy, getUser, profile.userUuid, resolveAvatarMutationError, upsertUser],
  );

  const handleRemoveCurrentPhoto = useCallback(() => {
    if (avatarBusy) return;

    const capabilities = getOwnAvatarCapabilities();
    if (capabilities.avatarChangesDisabled) {
      setAvatarError(t("settings.avatarChangesDisabled"));
      return;
    }

    setAvatarBusy(true);
    setAvatarError(null);
    void removeOwnAvatar()
      .then((result) => {
        if (!result.ok) {
          setAvatarError(resolveAvatarMutationError(result.kind, t("settings.avatarRemoveError")));
          return;
        }

        const existing = getUser(profile.userUuid);
        if (existing != null) {
          upsertUser({
            ...existing,
            avatarUrl: null,
            updatedAt: new Date().toISOString(),
          });
        }
        setAvatarDialogOpen(false);
      })
      .catch((error) => {
        log.error("Failed to remove own avatar", {
          error: error instanceof Error ? error.message : String(error),
        });
        setAvatarError(t("settings.avatarRemoveError"));
      })
      .finally(() => {
        setAvatarBusy(false);
      });
  }, [avatarBusy, getUser, profile.userUuid, resolveAvatarMutationError, upsertUser]);

  const navigateToDefaultTopic = useCallback(
    (streamUuid: string, topicUuid: string) => {
      if (runtimeContext == null) return;
      void navigate(
        workspaceMessengerTopicRoute({
          orgId: runtimeContext.organizationId,
          projectId: runtimeContext.projectId,
          streamUuid,
          topicUuid,
        }),
      );
    },
    [navigate, runtimeContext],
  );

  const handleMessage = useCallback(() => {
    if (messagePending || callPending || runtimeContext == null || profile.isOwnProfile) return;

    const messengerState = useMessengerStore.getState();
    const target = resolveDirectProfileChatNavigation({
      directUserUuid: profile.userUuid,
      streamsById: messengerState.streamsById,
      topicsById: messengerState.topicsById,
      currentRoute: currentMessengerRoute,
    });

    // Уже в этом ЛС (любой топик / stream) — никуда не ведём.
    if (target.status === "already-open") return;

    if (target.status === "open-default-topic") {
      navigateToDefaultTopic(target.streamUuid, target.topicUuid);
      return;
    }

    if (target.status === "missing-default-topic") {
      log.error("Default topic missing for existing direct stream", {
        streamUuid: target.streamUuid,
      });
      return;
    }

    // stream-missing → создаём ЛС и открываем его default topic.
    setMessagePending(true);
    void runWorkspaceDirectStreamCreate({ directUserUuid: profile.userUuid })
      .then((result) => {
        if (result.status !== "applied") return;
        navigateToDefaultTopic(result.stream.uuid, result.defaultTopic.uuid);
      })
      .catch((error) => {
        log.error("Failed to open direct message from profile", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        setMessagePending(false);
      });
  }, [
    callPending,
    currentMessengerRoute,
    messagePending,
    navigateToDefaultTopic,
    profile.isOwnProfile,
    profile.userUuid,
    runtimeContext,
  ]);

  // Звонок: та же навигация, что у «Написать», плюс pending → ChatPage шлёт в текущий/default топик.
  const handleCall = useCallback(() => {
    if (messagePending || callPending || runtimeContext == null || profile.isOwnProfile) return;

    const messengerState = useMessengerStore.getState();
    const target = resolveDirectProfileChatNavigation({
      directUserUuid: profile.userUuid,
      streamsById: messengerState.streamsById,
      topicsById: messengerState.topicsById,
      currentRoute: currentMessengerRoute,
    });

    if (target.status === "missing-default-topic") {
      log.error("Default topic missing for existing direct stream before call", {
        streamUuid: target.streamUuid,
      });
      return;
    }

    useChatDmCallBridgeStore.getState().setPendingDmCallPartnerUserUuid(profile.userUuid);

    if (target.status === "already-open") {
      // Остаёмся в текущем топике/stream — ChatPage подхватит pending и resolveSendTarget.
      return;
    }

    if (target.status === "open-default-topic") {
      navigateToDefaultTopic(target.streamUuid, target.topicUuid);
      return;
    }

    setCallPending(true);
    void runWorkspaceDirectStreamCreate({ directUserUuid: profile.userUuid })
      .then((result) => {
        if (result.status !== "applied") {
          useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
          return;
        }
        navigateToDefaultTopic(result.stream.uuid, result.defaultTopic.uuid);
      })
      .catch((error) => {
        useChatDmCallBridgeStore.getState().clearPendingDmCallPartner();
        log.error("Failed to open direct call from profile", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        setCallPending(false);
      });
  }, [
    callPending,
    currentMessengerRoute,
    messagePending,
    navigateToDefaultTopic,
    profile.isOwnProfile,
    profile.userUuid,
    runtimeContext,
  ]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary"
      data-testid="right-panel-user-profile"
      data-own-profile={profile.isOwnProfile ? "true" : "false"}
      data-editing={showEditChrome ? "true" : "false"}
    >
      {/* Horizontal padding lives on sections: aside already has px-2 (Figma inset ≈ 8px). */}
      <ScrollArea className="flex-1 py-2">
        {/* Figma right menu (12697:37361): vertical gap 20 between blocks */}
        <div className="space-y-5">
          {onBack != null && (
            <div className="flex items-center gap-2 px-1">
              <button
                type="button"
                onClick={onBack}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
                aria-label={t("common.back")}
                data-testid="right-panel-user-profile-back"
              >
                <Icon name="chevron-right" size={16} className="rotate-180 text-current" />
              </button>
              <h3 className="min-w-0 flex-1 truncate text-base font-medium text-text-primary">
                {resolvedHeaderTitle}
              </h3>
            </div>
          )}

          {/*
            View: avatar 64 + name / custom status / presence.
            Edit (Figma 12697:37361): avatar + stylus badge, "Имя" label + read-only name field.
            Display name stays read-only — Workspace API keeps IAM username/name fields read-only.
          */}
          <header className="flex items-center gap-4 px-2">
            {showEditChrome ? (
              // Кликабельный аватар: hover-кольцо + stylus-бейдж → модалка Edit avatar
              <button
                type="button"
                onClick={handleOpenAvatarDialog}
                className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={t("settings.editAvatarAria")}
                data-testid="right-panel-profile-edit-avatar"
              >
                <WorkspaceAvatar
                  size="xl"
                  avatarUrn={resolvedAvatarUrl}
                  interactive
                  className="bg-bg-elevated text-text-secondary"
                >
                  {profile.title.slice(0, 1)}
                </WorkspaceAvatar>
                {/* Figma: серый круг 20×20 + белая stylus в правом нижнем углу */}
                <span
                  className="pointer-events-none absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-icon-base text-white"
                  data-testid="right-panel-profile-avatar-edit-badge"
                  aria-hidden
                >
                  <Icon name="stylus" size={12} className="text-current" />
                </span>
              </button>
            ) : (
              <div className="relative shrink-0">
                <WorkspaceAvatar
                  size="xl"
                  avatarUrn={resolvedAvatarUrl}
                  className="bg-bg-elevated text-text-secondary"
                >
                  {profile.title.slice(0, 1)}
                </WorkspaceAvatar>
                {profile.status != null && (
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceIndicator status={presence} size="sm" />
                  </span>
                )}
              </div>
            )}

            {showEditChrome ? (
              <div className="flex min-w-0 flex-1 flex-col gap-0">
                <p className="text-xs font-normal leading-4 text-text-secondary">
                  {t("settings.fullName")}
                </p>
                {/*
                  Figma name field: h-32, radius 8, fill white 5%, pad 8/12.
                  Read-only: IAM-owned name cannot be patched from Workspace UI yet.
                */}
                <div
                  className="mt-0 flex h-8 items-center rounded-lg bg-card-bg px-2"
                  data-testid="right-panel-profile-name-readonly"
                >
                  <span className="truncate text-xs leading-4 text-text-primary">
                    {profile.title}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-16 min-w-0 flex-1 flex-col justify-between">
                <p className="truncate text-xl font-medium leading-6 text-text-primary">
                  {profile.title}
                </p>
                {customStatusLabel != null && (
                  <p
                    className="truncate text-xs leading-4 text-text-secondary"
                    data-testid="right-panel-profile-custom-status"
                  >
                    {customStatusLabel}
                  </p>
                )}
                {statusLabel != null && (
                  <p
                    className={`truncate text-xs leading-4 ${resolvePresenceStatusTextClass(profile.status)}`}
                    data-testid="right-panel-profile-presence"
                  >
                    {statusLabel}
                  </p>
                )}
              </div>
            )}
          </header>

          {showActions && (
            <RightPanelUserProfileActions
              variant={actionVariant}
              onFavorites={handleFavorites}
              onEdit={handleEdit}
              onShare={handleShare}
              onMessage={handleMessage}
              onCall={handleCall}
              shareDisabled={shareLink == null}
              shareCopied={shareCopied}
              messagePending={messagePending}
              callPending={callPending}
            />
          )}

          {/* Figma Line 37: hairline separator before detail list in edit mode */}
          {showEditChrome && <div className="mx-0 border-t border-border-subtle" aria-hidden />}

          <RightPanelUserProfileDetails details={profile.details} />

          {/*
            Figma footer (12697:37527 / 12697:37529): h-40, gap 8.
            Cancel fixed 110×40, px-16; Save hug/flex, px-16, Medium 14/20, no wrap.
            Cancel surface как в Edit avatar modal: bg-card-bg-active + hover:opacity-90.
            Save: bg-accent, label on-accent (#1b1b1d).
          */}
          {showEditChrome && (
            <div className="flex gap-2 px-0 pb-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="inline-flex h-10 w-[110px] shrink-0 items-center justify-center rounded-lg bg-card-bg-active px-4 text-sm font-medium leading-5 text-accent transition-colors hover:opacity-90"
                data-testid="right-panel-profile-cancel"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="inline-flex h-10 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-medium leading-5 text-on-accent transition-colors hover:opacity-90"
                data-testid="right-panel-profile-save"
              >
                {t("info.saveChanges")}
              </button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Скрытые file input: камера (capture) и галерея */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        data-testid="right-panel-edit-avatar-camera-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          handleAvatarFileSelected(file);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="right-panel-edit-avatar-gallery-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          handleAvatarFileSelected(file);
        }}
      />

      <RightPanelUserProfileEditAvatarDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
        hasAvatar={hasAvatar}
        busy={avatarBusy}
        error={avatarError}
        onTakePhoto={handleTakePhoto}
        onChooseFromGallery={handleChooseFromGallery}
        onRemoveCurrentPhoto={handleRemoveCurrentPhoto}
      />
    </div>
  );
};
