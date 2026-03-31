import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatListStore } from "~/entities/chat-list";
import { useDownloadStore } from "~/entities/download";
import type { DownloadEntry } from "~/entities/download";
import { useUserStatus, useUsersStore } from "~/entities/user";
import { t } from "~/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { getPresenceState } from "~/shared/lib/format";
import { Avatar, Icon } from "~/shared/ui";
import type { ReactNode } from "react";

function resolveAvatarSrc(url: string | undefined | null): string | undefined {
  return resolveAvatarUrl(url, getRealmBaseUrl());
}

function formatDownloadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export type TopBarSection = "chat" | "calendar" | "mail" | "calls" | "services";

interface TopBarProps {
  activeSection: TopBarSection;
  onSectionChange: (section: TopBarSection) => void;
  onOpenSearch?: () => void;
  /** Open the current user's profile drawer */
  onOpenProfile?: () => void;
  /** Left content (e.g. the instance switcher) */
  leftContent?: ReactNode;
}

const SECTIONS: {
  id: TopBarSection;
  icon: "chatBubble" | "calendar" | "mail" | "phone" | "grid";
  label: string;
  available: boolean;
}[] = [
  { id: "chat", icon: "chatBubble", label: t("nav.chatsAndChannels"), available: true },
  { id: "calendar", icon: "calendar", label: t("nav.calendar"), available: true },
  { id: "mail", icon: "mail", label: t("nav.mail"), available: true },
  { id: "calls", icon: "phone", label: t("nav.calls"), available: true },
  { id: "services", icon: "grid", label: t("nav.services"), available: true },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onSectionChange,
  onOpenSearch,
  onOpenProfile,
  leftContent,
}) => {
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const currentUser = useUsersStore((s) =>
    currentUserId != null ? s.getUser(currentUserId) : undefined,
  );
  const trimmedDisplayName = currentUser?.full_name?.trim();
  const displayName =
    trimmedDisplayName != null && trimmedDisplayName.length > 0
      ? trimmedDisplayName
      : t("nav.profile");
  const trimmedEmail = currentUser?.email?.trim();
  const displayEmail = trimmedEmail != null && trimmedEmail.length > 0 ? trimmedEmail : undefined;
  const currentStatus = useUserStatus(currentUserId);
  const currentStatusLabel = currentStatus.statusLabel;
  const emailMaxWidth = `${Math.max(displayName.length, 1)}ch`;
  const avatarLetter = displayName[0]?.toUpperCase() ?? "?";
  const avatarSrc = resolveAvatarSrc(currentUser?.avatar_url ?? undefined);
  const presenceState =
    currentUser?.presence != null
      ? getPresenceState(currentUser.presence.timestamp, currentUser.presence.status)
      : null;
  const downloads = useDownloadStore((s) => s.entries);
  const duplicateRequestTick = useDownloadStore((s) => s.duplicateRequestTick);
  const clearDownloads = useDownloadStore((s) => s.clearDownloads);
  const removeDownload = useDownloadStore((s) => s.removeDownload);
  const [downloadCenterOpen, setDownloadCenterOpen] = useState(false);
  const [downloadButtonPulse, setDownloadButtonPulse] = useState(false);
  const downloadCenterRef = useRef<HTMLDivElement>(null);
  const activeDownloadsCount = useMemo(
    () => downloads.filter((entry) => entry.status === "downloading").length,
    [downloads],
  );

  const renderDownloadStatus = useCallback((entry: DownloadEntry): string => {
    if (entry.status === "downloaded") return t("downloads.ready");
    if (entry.status === "error") return t("downloads.failed");
    if (entry.totalBytes != null && entry.totalBytes > 0) {
      const percent = Math.min(100, Math.round((entry.receivedBytes / entry.totalBytes) * 100));
      return t("downloads.downloadingWithTotal", {
        percent,
        received: formatDownloadBytes(entry.receivedBytes),
        total: formatDownloadBytes(entry.totalBytes),
      });
    }
    return t("downloads.downloadingWithoutTotal", {
      received: formatDownloadBytes(entry.receivedBytes),
    });
  }, []);

  useEffect(() => {
    if (downloads.length > 0) return;
    setDownloadCenterOpen(false);
  }, [downloads.length]);

  useEffect(() => {
    if (duplicateRequestTick === 0) return;
    setDownloadButtonPulse(true);
    const timer = setTimeout(() => {
      setDownloadButtonPulse(false);
    }, 380);
    return () => clearTimeout(timer);
  }, [duplicateRequestTick]);

  useEffect(() => {
    if (!downloadCenterOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (downloadCenterRef.current?.contains(target)) return;
      setDownloadCenterOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDownloadCenterOpen(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [downloadCenterOpen]);

  return (
    <header
      className="mb-1 flex w-full items-center justify-between gap-4 rounded-b-xl border-b border-border-subtle bg-bg-elevated p-2"
      data-focus-zone="topbar"
      role="banner"
      aria-label={t("a11y.topBar")}
    >
      {/* Left: instance switcher */}
      <div
        data-testid="topbar-left-slot"
        className={leftContent != null ? "min-w-0 flex-shrink-0 pl-5" : "min-w-0 flex-shrink-0"}
      >
        {leftContent}
      </div>
      {/* Center: app sections */}
      <div
        data-testid="topbar-sections-slot"
        className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1.5 pl-2"
      >
        <div className="flex items-center gap-2">
          {SECTIONS.map(({ id, icon, label, available }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSectionChange(id)}
                disabled={!available}
                title={!available ? t("app.webModeUnavailable") : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-lg opacity-100 transition-colors ${
                  isActive
                    ? "border border-border-subtle bg-card-bg-active text-text-primary"
                    : available
                      ? "hover:bg-bg/50 text-text-muted hover:text-text-primary"
                      : "text-text-muted/60 cursor-not-allowed"
                }`}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon name={icon} size={24} className="text-current" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: current user profile — opens the profile drawer on click */}
      <div className="flex flex-shrink-0 items-center gap-3">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="hover:bg-bg/50 flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-primary"
            aria-label={t("search.search")}
          >
            <Icon name="search" size={20} className="text-current" />
          </button>
        )}
        {downloads.length > 0 && (
          <div ref={downloadCenterRef} className="relative">
            <button
              type="button"
              onClick={() => setDownloadCenterOpen((prev) => !prev)}
              className={`hover:bg-bg/50 relative rounded-lg p-2 text-text-muted transition-all hover:text-text-primary ${
                downloadButtonPulse ? "scale-110" : ""
              }`}
              aria-label={t("downloads.open")}
              aria-haspopup="dialog"
              aria-expanded={downloadCenterOpen}
              aria-controls="download-center-panel"
            >
              <Icon name="files" size={20} className="text-current" />
              {activeDownloadsCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">
                  {activeDownloadsCount}
                </span>
              )}
            </button>
            {downloadCenterOpen && (
              <div
                id="download-center-panel"
                role="dialog"
                aria-label={t("downloads.title")}
                className="absolute right-0 top-11 z-dropdown w-80 overflow-hidden rounded-xl border border-border-subtle bg-card-bg shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
                  <span className="text-sm font-medium text-text-primary">
                    {t("downloads.title")}
                  </span>
                  <button
                    type="button"
                    onClick={clearDownloads}
                    className="text-xs text-text-muted transition-colors hover:text-text-primary"
                  >
                    {t("downloads.clear")}
                  </button>
                </div>
                <ul className="max-h-64 overflow-y-auto p-1">
                  {downloads.map((entry) => (
                    <li
                      key={entry.path}
                      className="hover:bg-bg-elevated/60 flex items-center gap-2 rounded-lg px-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {entry.fileName}
                        </p>
                        <p
                          className={`truncate text-xs ${
                            entry.status === "error" ? "text-notice-base" : "text-text-muted"
                          }`}
                          role="status"
                          aria-live="polite"
                        >
                          {renderDownloadStatus(entry)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDownload(entry.path)}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
                        aria-label={`${t("downloads.remove")} ${entry.fileName}`}
                      >
                        <Icon name="close" size={14} className="text-current" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenProfile}
          className="hover:bg-bg/50 relative flex items-center gap-2 rounded-lg p-1.5 text-left transition-colors"
          aria-label={t("nav.profile")}
        >
          <div className="relative flex-shrink-0">
            <Avatar size="xs" src={avatarSrc}>
              {avatarLetter}
            </Avatar>
            {presenceState === "active" && (
              <span
                className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bg-elevated bg-indicator-green"
                aria-label={t("a11y.online")}
              />
            )}
            {presenceState === "idle" && (
              <span
                className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bg-elevated bg-indicator-orange"
                aria-label={t("a11y.away")}
              />
            )}
          </div>
          <div className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
            <span className="text-sm font-medium text-text-primary">{displayName}</span>
            {currentStatusLabel && (
              <span
                className="block truncate text-[11px] text-text-secondary"
                style={{ maxWidth: emailMaxWidth }}
              >
                {currentStatusLabel}
              </span>
            )}
            {displayEmail && (
              <span
                className="block truncate text-[11px] text-text-secondary"
                style={{ maxWidth: emailMaxWidth }}
              >
                {displayEmail}
              </span>
            )}
          </div>
          <Icon name="chevron-down" size={16} className="shrink-0 text-text-muted" />
        </button>
      </div>
    </header>
  );
};
