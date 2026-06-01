import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  fetchOwnStatus,
  fetchUserProfile,
  getOwnAvatarCapabilities,
  removeOwnAvatar,
  uploadOwnAvatar,
  updateOwnProfile,
  updateOwnStatus,
} from "~/features/user-profile/user-profile.api";
import {
  type OwnStatusData,
  type UserProfileData,
} from "~/features/user-profile/user-profile.types";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { bumpAvatarVersion, resolveAvatarUrl } from "~/shared/lib/avatar";
import { writeText } from "~/shared/lib/clipboard";
import { formatDateJoined } from "~/shared/lib/datetime.lib";
import { getRoleLabel, parseRole } from "~/shared/lib/roles";
import { detectImageMime, isValidRealmUrl, validateFileUpload } from "~/shared/lib/validation";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";

const AVATAR_MAGIC_BYTE_VALIDATED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function normalizeImageMime(mime: string): string {
  const normalized = mime.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function getRuntimeSupportedTimezones(): string[] {
  if (typeof Intl.supportedValuesOf !== "function") return [];
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

function canonicalizeTimezone(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

type PendingAvatarAction =
  | { kind: "none" }
  | { kind: "upload"; file: File; previewUrl: string }
  | { kind: "remove" };

const EMPTY_PENDING_AVATAR_ACTION: PendingAvatarAction = { kind: "none" };

export const SettingsPersonalInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableFullName, setEditableFullName] = useState("");
  const [editableTimezone, setEditableTimezone] = useState("");
  const [ownStatus, setOwnStatus] = useState<OwnStatusData | null>(null);
  const [editableStatusText, setEditableStatusText] = useState("");
  const [editableStatusAway, setEditableStatusAway] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [timezoneDraftError, setTimezoneDraftError] = useState<string | null>(null);
  const [pendingAvatarAction, setPendingAvatarAction] = useState<PendingAvatarAction>(
    EMPTY_PENDING_AVATAR_ACTION,
  );
  const [avatarDraftError, setAvatarDraftError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const user = useUsersStore((s) => (currentUserId != null ? s.getUser(currentUserId) : undefined));
  const mergeUser = useUsersStore((s) => s.mergeUser);
  const currentInstance = useInstancesStore((s) => s.getCurrentInstance());
  const avatarCapabilities = getOwnAvatarCapabilities();
  const supportedTimezones = useMemo(() => getRuntimeSupportedTimezones(), []);
  const supportedTimezoneSet = useMemo(() => new Set(supportedTimezones), [supportedTimezones]);

  useEffect(() => {
    let cancelled = false;
    if (currentUserId == null) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setProfile(null);
          setOwnStatus(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all([fetchUserProfile(currentUserId), fetchOwnStatus()])
      .then(([nextProfile, nextOwnStatus]) => {
        if (!cancelled) {
          setProfile(nextProfile);
          setOwnStatus(nextOwnStatus);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setOwnStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const fullName = useMemo(() => {
    const profileName = profile?.fullName?.trim();
    if (profileName != null && profileName.length > 0) return profileName;
    const userName = user?.full_name?.trim();
    return userName != null && userName.length > 0 ? userName : "-";
  }, [profile?.fullName, user?.full_name]);

  useEffect(() => {
    if (isEditing) return;
    setEditableFullName(fullName === "-" ? "" : fullName);
    setEditableTimezone(profile?.timezone?.trim() ?? "");
    setEditableStatusText(ownStatus?.statusText ?? "");
    setEditableStatusAway(ownStatus?.away ?? false);
  }, [fullName, isEditing, ownStatus?.away, ownStatus?.statusText, profile?.timezone]);

  const email = useMemo(() => {
    const profileEmail = profile?.email?.trim();
    if (profileEmail != null && profileEmail.length > 0) return profileEmail;
    const userEmail = user?.email?.trim();
    return userEmail != null && userEmail.length > 0 ? userEmail : "-";
  }, [profile?.email, user?.email]);

  const userId = useMemo(() => {
    const value = profile?.userId ?? currentUserId;
    return value != null ? String(value) : "-";
  }, [profile?.userId, currentUserId]);

  const timezone = useMemo(() => {
    const value = profile?.timezone?.trim();
    return value && value.length > 0 ? value : "-";
  }, [profile?.timezone]);

  const localTime = useMemo(() => {
    const value = profile?.localTime?.trim();
    return value && value.length > 0 ? value : "-";
  }, [profile?.localTime]);

  const joinedDate = useMemo(() => {
    return formatDateJoined(profile?.dateJoined) ?? "-";
  }, [profile?.dateJoined]);

  const jobTitle = useMemo(() => {
    const value = profile?.jobTitle?.trim();
    return value && value.length > 0 ? value : "-";
  }, [profile?.jobTitle]);

  const manager = useMemo(() => {
    const value = profile?.manager?.trim();
    return value && value.length > 0 ? value : "-";
  }, [profile?.manager]);

  const phone = useMemo(() => {
    const value = profile?.phone?.trim();
    return value && value.length > 0 ? value : "-";
  }, [profile?.phone]);

  const birthday = useMemo(() => {
    const value = profile?.birthday?.trim();
    return value && value.length > 0 ? value : "-";
  }, [profile?.birthday]);

  const role = useMemo(() => {
    if (profile == null) return "-";
    return getRoleLabel(parseRole(profile.role));
  }, [profile]);

  const accountType = useMemo(() => {
    if (profile?.isBot == null) return "-";
    return profile.isBot ? t("info.botAccount") : t("info.humanAccount");
  }, [profile?.isBot]);

  const accountStatus = useMemo(() => {
    if (profile?.isActive == null) return "-";
    return profile.isActive ? t("info.active") : t("info.deactivated");
  }, [profile?.isActive]);

  const profileLink = useMemo(() => {
    const realm = currentInstance?.realm?.trim();
    if (!realm || !isValidRealmUrl(realm) || userId === "-") return undefined;
    return `${realm.replace(/\/+$/, "")}/#user/${userId}`;
  }, [currentInstance?.realm, userId]);

  const handleShareProfile = useCallback(() => {
    if (!profileLink) return;
    void writeText(profileLink).then((ok) => {
      if (ok) setCopied(true);
    });
  }, [profileLink]);

  const handleStartProfileEdit = useCallback(() => {
    setEditableFullName(fullName === "-" ? "" : fullName);
    setEditableTimezone(profile?.timezone?.trim() ?? "");
    setEditableStatusText(ownStatus?.statusText ?? "");
    setEditableStatusAway(ownStatus?.away ?? false);
    setPendingAvatarAction(EMPTY_PENDING_AVATAR_ACTION);
    setAvatarDraftError(null);
    setTimezoneDraftError(null);
    setProfileSaveError(null);
    setIsEditing(true);
  }, [fullName, ownStatus?.away, ownStatus?.statusText, profile?.timezone]);

  const handleCancelProfileEdit = useCallback(() => {
    setEditableFullName(fullName === "-" ? "" : fullName);
    setEditableTimezone(profile?.timezone?.trim() ?? "");
    setEditableStatusText(ownStatus?.statusText ?? "");
    setEditableStatusAway(ownStatus?.away ?? false);
    setPendingAvatarAction(EMPTY_PENDING_AVATAR_ACTION);
    setAvatarDraftError(null);
    setTimezoneDraftError(null);
    setProfileSaveError(null);
    setIsEditing(false);
  }, [fullName, ownStatus?.away, ownStatus?.statusText, profile?.timezone]);

  const profileStatus = useMemo(() => {
    const trimmedStatus = ownStatus?.statusText?.trim() ?? "";
    if (trimmedStatus.length === 0) {
      return ownStatus?.away ? t("presence.away") : t("presence.online");
    }
    return ownStatus?.away ? `${trimmedStatus} • ${t("presence.away")}` : trimmedStatus;
  }, [ownStatus?.away, ownStatus?.statusText]);

  const mapAvatarErrorMessage = useCallback(
    (kind: "forbidden" | "invalid" | "unsupported" | "transient", fallbackMessage?: string) => {
      if (kind === "forbidden") return t("settings.avatarChangesDisabled");
      if (kind === "unsupported") return t("settings.avatarUnsupported");
      if (kind === "invalid") return fallbackMessage ?? t("settings.avatarInvalidFile");
      return t("settings.avatarUpdateError");
    },
    [],
  );

  const handleSaveProfile = useCallback(() => {
    if (currentUserId == null || isSavingProfile) return;
    const trimmedFullName = editableFullName.trim();
    const trimmedStatusText = editableStatusText.trim();
    const trimmedTimezone = editableTimezone.trim();
    if (trimmedFullName.length === 0) {
      setProfileSaveError(t("settings.fullNameRequired"));
      return;
    }
    const canonicalTimezone = canonicalizeTimezone(trimmedTimezone);
    if (trimmedTimezone.length === 0) {
      setTimezoneDraftError(t("settings.timezoneRequired"));
      return;
    }
    if (canonicalTimezone == null) {
      setTimezoneDraftError(t("settings.timezoneInvalid"));
      return;
    }
    if (
      supportedTimezoneSet.size > 0 &&
      !supportedTimezoneSet.has(canonicalTimezone) &&
      !supportedTimezoneSet.has(trimmedTimezone)
    ) {
      setTimezoneDraftError(t("settings.timezoneInvalid"));
      return;
    }

    setIsSavingProfile(true);
    setProfileSaveError(null);
    setAvatarDraftError(null);
    setTimezoneDraftError(null);

    void (async () => {
      const avatarSnapshot = useUsersStore.getState().getAvatarUrl(currentUserId) ?? "";
      let avatarMutationCommitted = false;
      let committedAvatarUrl = avatarSnapshot;

      if (pendingAvatarAction.kind === "upload") {
        // Optimistic preview for global UI surfaces while save is in-flight.
        mergeUser({
          user_id: currentUserId,
          avatar_url: pendingAvatarAction.previewUrl,
        });

        const result = await uploadOwnAvatar(pendingAvatarAction.file);
        if (!result.ok) {
          mergeUser({
            user_id: currentUserId,
            avatar_url: avatarSnapshot,
          });
          setAvatarDraftError(mapAvatarErrorMessage(result.kind, result.message));
          return;
        }

        avatarMutationCommitted = true;
        committedAvatarUrl = result.avatarUrl ?? avatarSnapshot;
        setProfile((prev) => (prev ? { ...prev, avatarUrl: committedAvatarUrl } : prev));
        mergeUser({
          user_id: currentUserId,
          avatar_url: committedAvatarUrl,
        });
        bumpAvatarVersion();
        setPendingAvatarAction(EMPTY_PENDING_AVATAR_ACTION);
      }

      if (pendingAvatarAction.kind === "remove") {
        // Optimistic removal so all widgets fallback to initials/avatar placeholder.
        mergeUser({
          user_id: currentUserId,
          avatar_url: "",
        });

        const result = await removeOwnAvatar();
        if (!result.ok) {
          mergeUser({
            user_id: currentUserId,
            avatar_url: avatarSnapshot,
          });
          const message =
            result.kind === "invalid"
              ? t("settings.avatarRemoveError")
              : mapAvatarErrorMessage(result.kind, result.message);
          setAvatarDraftError(message);
          return;
        }

        avatarMutationCommitted = true;
        committedAvatarUrl = result.avatarUrl ?? "";
        setProfile((prev) => (prev ? { ...prev, avatarUrl: committedAvatarUrl } : prev));
        mergeUser({
          user_id: currentUserId,
          avatar_url: committedAvatarUrl,
        });
        bumpAvatarVersion();
        setPendingAvatarAction(EMPTY_PENDING_AVATAR_ACTION);
      }

      const [profileUpdated, statusUpdated] = await Promise.all([
        updateOwnProfile({ fullName: trimmedFullName, timezone: canonicalTimezone }),
        updateOwnStatus({ statusText: trimmedStatusText, away: editableStatusAway }),
      ]);

      if (!profileUpdated.ok) {
        if (profileUpdated.kind === "unsupported") {
          setTimezoneDraftError(t("settings.timezoneUnsupported"));
        } else if (profileUpdated.kind === "invalid") {
          setTimezoneDraftError(t("settings.timezoneInvalid"));
        } else {
          setProfileSaveError(t("settings.profileSaveError"));
        }
        return;
      }

      if (!statusUpdated) {
        // Avatar mutation has already been committed by server, keep it as-is.
        if (avatarMutationCommitted) {
          mergeUser({
            user_id: currentUserId,
            avatar_url: committedAvatarUrl,
          });
        }
        setProfileSaveError(t("settings.profileSaveError"));
        return;
      }

      setProfile((prev) =>
        prev ? { ...prev, fullName: trimmedFullName, timezone: canonicalTimezone } : prev,
      );
      setOwnStatus({ statusText: trimmedStatusText, away: editableStatusAway });
      mergeUser({ user_id: currentUserId, full_name: trimmedFullName });
      setIsEditing(false);
      setPendingAvatarAction(EMPTY_PENDING_AVATAR_ACTION);
      setAvatarDraftError(null);
      setTimezoneDraftError(null);
    })()
      .catch(() => {
        setProfileSaveError(t("settings.profileSaveError"));
      })
      .finally(() => {
        setIsSavingProfile(false);
      });
  }, [
    currentUserId,
    editableFullName,
    editableStatusAway,
    editableStatusText,
    editableTimezone,
    isSavingProfile,
    mapAvatarErrorMessage,
    mergeUser,
    pendingAvatarAction,
    profile?.timezone,
    supportedTimezoneSet,
  ]);

  const validateAvatarFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (file.size === 0) return t("settings.avatarInvalidFile");
      if (file.size > avatarCapabilities.maxAvatarFileSizeMib * 1024 * 1024) {
        return t("settings.avatarTooLarge", {
          maxSizeMb: avatarCapabilities.maxAvatarFileSizeMib,
        });
      }
      const validation = validateFileUpload(file);
      if (!validation.valid && validation.error?.includes("empty")) {
        return t("settings.avatarInvalidFile");
      }

      if (!file.type.startsWith("image/")) {
        return t("settings.avatarInvalidFile");
      }

      const expectedMime = normalizeImageMime(file.type);
      if (!AVATAR_MAGIC_BYTE_VALIDATED_IMAGE_TYPES.has(expectedMime)) {
        return null;
      }

      const detected = detectImageMime(await file.arrayBuffer());
      if (detected == null || normalizeImageMime(detected) !== expectedMime) {
        return t("settings.avatarInvalidFile");
      }

      return null;
    },
    [avatarCapabilities.maxAvatarFileSizeMib],
  );

  const handleAvatarUploadChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const [file] = Array.from(event.target.files ?? []);
      event.currentTarget.value = "";
      if (!file || currentUserId == null || !isEditing || isSavingProfile) {
        return;
      }
      if (avatarCapabilities.avatarChangesDisabled) {
        setAvatarDraftError(t("settings.avatarChangesDisabled"));
        return;
      }
      setAvatarDraftError(null);

      void validateAvatarFile(file).then((validationError) => {
        if (validationError) {
          setAvatarDraftError(validationError);
          return;
        }

        const previewUrl = URL.createObjectURL(file);
        setPendingAvatarAction({ kind: "upload", file, previewUrl });
      });
    },
    [
      avatarCapabilities.avatarChangesDisabled,
      currentUserId,
      isEditing,
      isSavingProfile,
      validateAvatarFile,
    ],
  );

  const handleAvatarRemove = useCallback(() => {
    if (currentUserId == null || !isEditing || isSavingProfile) return;
    if (avatarCapabilities.avatarChangesDisabled) {
      setAvatarDraftError(t("settings.avatarChangesDisabled"));
      return;
    }
    setAvatarDraftError(null);
    setPendingAvatarAction({ kind: "remove" });
  }, [avatarCapabilities.avatarChangesDisabled, currentUserId, isEditing, isSavingProfile]);

  useEffect(() => {
    if (pendingAvatarAction.kind !== "upload") return;
    return () => {
      URL.revokeObjectURL(pendingAvatarAction.previewUrl);
    };
  }, [pendingAvatarAction]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  const avatarFallback = useMemo(() => {
    if (fullName === "-") return "?";
    return fullName.trim().slice(0, 1).toUpperCase();
  }, [fullName]);

  const avatarSrc = useMemo(() => {
    if (pendingAvatarAction.kind === "upload") {
      return pendingAvatarAction.previewUrl;
    }
    if (pendingAvatarAction.kind === "remove") {
      return null;
    }
    const profileAvatar = profile?.avatarUrl;
    if (profileAvatar != null && profileAvatar.length > 0) {
      return resolveAvatarUrl(profileAvatar, getRealmBaseUrl()) ?? null;
    }
    const userAvatar = user?.avatar_url;
    if (userAvatar == null || userAvatar.length === 0) return null;
    return resolveAvatarUrl(userAvatar, getRealmBaseUrl()) ?? null;
  }, [pendingAvatarAction, profile?.avatarUrl, user?.avatar_url]);

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <ChatHeader channelName={t("settings.personalInfo")} hideTopic hideParticipants />
      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="rounded-xl border border-border-subtle bg-card-bg p-4">
          <header className="border-b border-border-subtle pb-3">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">
              {t("info.information")}
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleAvatarUploadChange}
            />
            <div className="flex items-center gap-3">
              <Avatar size="lg" src={avatarSrc}>
                {avatarFallback}
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{fullName}</p>
                <p className="text-[11px] text-text-secondary">{profileStatus}</p>
                {isEditing && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                      disabled={avatarCapabilities.avatarChangesDisabled || isSavingProfile}
                      className="rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-primary transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("settings.changeAvatar")}
                    </button>
                    <button
                      type="button"
                      onClick={handleAvatarRemove}
                      disabled={avatarCapabilities.avatarChangesDisabled || isSavingProfile}
                      className="rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-primary transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("settings.removeAvatar")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <ul className="mt-3 space-y-2">
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="profile" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("settings.fullName")}
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editableFullName}
                    onChange={(e) => setEditableFullName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveProfile();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleCancelProfileEdit();
                      }
                    }}
                    className="w-56 max-w-full rounded-md border border-border-subtle bg-bg px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
                    aria-label={t("settings.fullName")}
                  />
                ) : (
                  <span className="block truncate whitespace-nowrap text-text-primary">
                    {fullName}
                  </span>
                )}
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="calendar" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.timezone")}
                </p>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editableTimezone}
                      onChange={(e) => {
                        setEditableTimezone(e.target.value);
                        setTimezoneDraftError(null);
                      }}
                      list="settings-timezone-options"
                      className="w-72 max-w-full rounded-md border border-border-subtle bg-bg px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
                      placeholder={t("settings.timezonePlaceholder")}
                      aria-label={t("info.timezone")}
                    />
                    <datalist id="settings-timezone-options">
                      {supportedTimezones.map((timezoneOption) => (
                        <option key={timezoneOption} value={timezoneOption} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <span className="block truncate whitespace-nowrap text-text-primary">
                    {timezone}
                  </span>
                )}
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="info" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("settings.status")}
                </p>
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={editableStatusText}
                      onChange={(e) => setEditableStatusText(e.target.value)}
                      className="w-56 max-w-full rounded-md border border-border-subtle bg-bg px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
                      placeholder={t("settings.statusPlaceholder")}
                      aria-label={t("settings.status")}
                    />
                    <label className="flex items-center gap-1 text-xs text-text-muted">
                      <input
                        type="checkbox"
                        checked={editableStatusAway}
                        onChange={(e) => setEditableStatusAway(e.target.checked)}
                        className="h-4 w-4 rounded border-border-subtle"
                      />
                      <span>{t("presence.away")}</span>
                    </label>
                  </div>
                ) : (
                  <span className="block truncate whitespace-nowrap text-text-primary">
                    {profileStatus}
                  </span>
                )}
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="profile" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.userId")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">{userId}</span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="mail" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("common.email")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">{email}</span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="businessCenter" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.jobTitle")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {jobTitle}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="handshake" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.manager")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {manager}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="phone" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.phone")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">{phone}</span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="profile" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.role")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">{role}</span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="group" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.accountType")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {accountType}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="info" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.accountStatus")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {accountStatus}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="calendar" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.localTime")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {localTime}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="calendar" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.joined")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {joinedDate}
                </span>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm">
              <Icon name="calendar" size={20} className="mt-0.5 shrink-0 text-icon-base" />
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  {t("info.birthday")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {birthday}
                </span>
              </div>
            </li>
          </ul>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              type="button"
              onClick={handleStartProfileEdit}
              className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg"
            >
              {t("settings.editProfile")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={handleCancelProfileEdit}
                disabled={isSavingProfile}
                className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleShareProfile}
            disabled={profileLink == null}
            className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="links" size={16} className="text-current" />
            {t("settings.shareProfile")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg"
          >
            {t("settings.settings")}
          </button>
        </div>
        {copied && <p className="text-sm text-accent">{t("settings.profileLinkCopied")}</p>}
        {profileSaveError && <p className="text-sm text-notice-base">{profileSaveError}</p>}
        {avatarDraftError && <p className="text-sm text-notice-base">{avatarDraftError}</p>}
        {timezoneDraftError && <p className="text-sm text-notice-base">{timezoneDraftError}</p>}
      </section>
    </div>
  );
};
