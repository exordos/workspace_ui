import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { fetchRealmProfileFieldDefinitions } from "~/shared/api/zulip-realm-profile-fields";
import { sanitizeHtml } from "~/shared/lib/html";
import {
  getCustomProfileFieldLines,
  type CustomProfileFieldLine,
  type ZulipCustomProfileDataMap,
} from "~/shared/lib/user-profile-fields.lib";
import type { RealmProfileFieldDefinition } from "~/shared/lib/zulip-profile-fields-map.lib";
import { useUsersStore } from "./user.model";

export interface ProfileCustomFieldsBlockProps {
  profileData?: ZulipCustomProfileDataMap | null;
  baseUrl?: string;
  className?: string;
  /** Tighter typography for popovers and dense lists. */
  density?: "compact" | "comfortable";
  /** When false, omits the "Custom profile fields" heading (e.g. mention popover). */
  showSectionTitle?: boolean;
  /** When set, manager / person-picker fields open this user's full profile. */
  onOpenUserProfile?: (userId: number) => void;
}

const ManagerProfileLink = React.memo(function ManagerProfileLink({
  userId,
  fallbackLabel,
  textClass,
  onOpen,
}: {
  userId: number;
  fallbackLabel: string | undefined;
  textClass: string;
  onOpen: (userId: number) => void;
}) {
  const nameFromStore = useUsersStore((s) => s.getUser(userId)?.full_name?.trim());
  const label =
    nameFromStore != null && nameFromStore.length > 0
      ? nameFromStore
      : fallbackLabel != null && fallbackLabel.trim().length > 0
        ? fallbackLabel.trim()
        : `#${userId}`;

  const handleClick = useCallback(() => {
    onOpen(userId);
  }, [onOpen, userId]);

  return (
    <button
      type="button"
      className={`text-left text-accent underline-offset-2 hover:underline ${textClass}`}
      onClick={handleClick}
    >
      {label}
    </button>
  );
});

ManagerProfileLink.displayName = "ManagerProfileLink";

function renderLineContent(
  line: CustomProfileFieldLine,
  onOpenUserProfile: ((userId: number) => void) | undefined,
  textClass: string,
  baseUrl?: string,
): React.ReactNode {
  if (line.managerProfileUserId != null && onOpenUserProfile != null) {
    return (
      <ManagerProfileLink
        userId={line.managerProfileUserId}
        fallbackLabel={line.managerDisplayFallback}
        textClass={textClass}
        onOpen={onOpenUserProfile}
      />
    );
  }
  if (line.html != null) {
    const safeHtml = sanitizeHtml(line.html, baseUrl);
    return (
      <div
        className="[&_a]:text-accent [&_code]:text-text-primary [&_p+p]:mt-1 [&_p]:my-0"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }
  if (line.plainText != null) {
    return <p className="whitespace-pre-wrap">{line.plainText}</p>;
  }
  return null;
}

/**
 * Renders Zulip `profile_data` custom fields (sanitized HTML, plain text, or manager → profile link).
 */
export const ProfileCustomFieldsBlock = React.memo(function ProfileCustomFieldsBlock({
  profileData,
  baseUrl,
  className = "",
  density = "comfortable",
  showSectionTitle = true,
  onOpenUserProfile,
}: ProfileCustomFieldsBlockProps) {
  const { t } = useTranslation();
  const [fieldDefinitions, setFieldDefinitions] = useState<RealmProfileFieldDefinition[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchRealmProfileFieldDefinitions().then((fields) => {
      if (!cancelled) {
        setFieldDefinitions(fields ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lines = useMemo(
    () => getCustomProfileFieldLines(profileData ?? undefined, baseUrl, fieldDefinitions),
    [profileData, baseUrl, fieldDefinitions],
  );

  if (lines.length === 0) return null;

  const textClass =
    density === "compact"
      ? "text-[11px] leading-snug text-text-primary"
      : "text-sm text-text-primary";
  const labelClass =
    density === "compact"
      ? "mb-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary"
      : "mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary";

  return (
    <div className={className}>
      {showSectionTitle ? <p className={labelClass}>{t("info.customProfileFields")}</p> : null}
      <ul className={`space-y-1.5 ${textClass}`}>
        {lines.map((line) => (
          <li key={line.fieldKey} className={`min-w-0 break-words ${textClass}`}>
            {renderLineContent(line, onOpenUserProfile, textClass, baseUrl)}
          </li>
        ))}
      </ul>
    </div>
  );
});

ProfileCustomFieldsBlock.displayName = "ProfileCustomFieldsBlock";
