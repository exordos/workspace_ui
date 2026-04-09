import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  type OwnStatusData,
  type UserProfileData,
} from "~/features/user-profile/user-profile.types";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";
import { fetchOwnStatus, fetchUserProfile, updateOwnProfile, updateOwnStatus } from "~/features/user-profile/user-profile.api";
import { t } from "~/i18n/i18n";
import { getRoleLabel, parseRole } from "~/shared/lib/roles";
import { isValidRealmUrl } from "~/shared/lib/validation";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { ChatHeader } from "~/widgets/chat-view/chat-header.ui";

function formatDateJoined(dateJoined: string | undefined): string | undefined {
  if (!dateJoined) return undefined;
  const trimmed = dateJoined.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export const SettingsPersonalInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editableFullName, setEditableFullName] = useState("");
  const [ownStatus, setOwnStatus] = useState<OwnStatusData | null>(null);
  const [editableStatusText, setEditableStatusText] = useState("");
  const [editableStatusAway, setEditableStatusAway] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const user = useUsersStore((s) => (currentUserId != null ? s.getUser(currentUserId) : undefined));
  const mergeUser = useUsersStore((s) => s.mergeUser);
  const currentInstance = useInstancesStore((s) => s.getCurrentInstance());

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
    setEditableStatusText(ownStatus?.statusText ?? "");
    setEditableStatusAway(ownStatus?.away ?? false);
  }, [fullName, isEditing, ownStatus?.away, ownStatus?.statusText]);

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
    if (!profileLink || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(profileLink).then(() => {
      setCopied(true);
    });
  }, [profileLink]);

  const handleStartProfileEdit = useCallback(() => {
    setEditableFullName(fullName === "-" ? "" : fullName);
    setEditableStatusText(ownStatus?.statusText ?? "");
    setEditableStatusAway(ownStatus?.away ?? false);
    setProfileSaveError(null);
    setIsEditing(true);
  }, [fullName, ownStatus?.away, ownStatus?.statusText]);

  const handleCancelProfileEdit = useCallback(() => {
    setEditableFullName(fullName === "-" ? "" : fullName);
    setEditableStatusText(ownStatus?.statusText ?? "");
    setEditableStatusAway(ownStatus?.away ?? false);
    setProfileSaveError(null);
    setIsEditing(false);
  }, [fullName, ownStatus?.away, ownStatus?.statusText]);

  const profileStatus = useMemo(() => {
    const trimmedStatus = ownStatus?.statusText?.trim() ?? "";
    if (trimmedStatus.length === 0) {
      return ownStatus?.away ? t("presence.away") : t("presence.online");
    }
    return ownStatus?.away ? `${trimmedStatus} • ${t("presence.away")}` : trimmedStatus;
  }, [ownStatus?.away, ownStatus?.statusText]);

  const handleSaveProfile = useCallback(() => {
    if (currentUserId == null || isSavingProfile) return;
    const trimmedFullName = editableFullName.trim();
    const trimmedStatusText = editableStatusText.trim();
    if (trimmedFullName.length === 0) {
      setProfileSaveError(t("settings.fullNameRequired"));
      return;
    }
    setIsSavingProfile(true);
    setProfileSaveError(null);
    void Promise.all([
      updateOwnProfile({ fullName: trimmedFullName }),
      updateOwnStatus({ statusText: trimmedStatusText, away: editableStatusAway }),
    ])
      .then(([profileUpdated, statusUpdated]) => {
        if (!profileUpdated || !statusUpdated) {
          setProfileSaveError(t("settings.profileSaveError"));
          return;
        }
        setProfile((prev) => (prev ? { ...prev, fullName: trimmedFullName } : prev));
        setOwnStatus({ statusText: trimmedStatusText, away: editableStatusAway });
        mergeUser({ user_id: currentUserId, full_name: trimmedFullName });
        setIsEditing(false);
      })
      .finally(() => {
        setIsSavingProfile(false);
      });
  }, [
    currentUserId,
    editableFullName,
    editableStatusAway,
    editableStatusText,
    isSavingProfile,
    mergeUser,
  ]);

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
    const profileAvatar = profile?.avatarUrl;
    if (profileAvatar != null && profileAvatar.length > 0) return profileAvatar;
    const userAvatar = user?.avatar_url;
    return userAvatar != null && userAvatar.length > 0 ? userAvatar : null;
  }, [profile?.avatarUrl, user?.avatar_url]);

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <ChatHeader channelName={t("settings.personalInfo")} hideTopic hideParticipants />
      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="rounded-xl border border-border-subtle bg-card-bg p-4">
          <header className="border-b border-border-subtle pb-3">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">
              {t("info.information")}
            </h2>
            <div className="flex items-center gap-3">
              <Avatar size="lg" src={avatarSrc}>
                {avatarFallback}
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{fullName}</p>
                <p className="text-[11px] text-text-secondary">{profileStatus}</p>
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
                  {t("info.timezone")}
                </p>
                <span className="block truncate whitespace-nowrap text-text-primary">
                  {timezone}
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
      </section>
    </div>
  );
};
