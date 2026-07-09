import React, { useCallback, useMemo } from "react";
import { useTranslation } from "~/i18n/i18n";
import { sanitizeHtml } from "~/shared/lib/html";
import {
  getCustomProfileFieldLines,
  type CustomProfileFieldLine,
  type ZulipCustomProfileDataMap,
} from "~/shared/lib/user-profile-fields.lib";
import { SectionLabel } from "~/shared/ui/section-label.ui";

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
  let label: string;
  if (fallbackLabel != null && fallbackLabel.trim().length > 0) {
    label = fallbackLabel.trim();
  } else {
    label = `#${userId}`;
  }

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

  const lines = useMemo(
    () => getCustomProfileFieldLines(profileData ?? undefined, baseUrl, null),
    [profileData, baseUrl],
  );

  if (lines.length === 0) return null;

  const textClass =
    density === "compact"
      ? "text-sm leading-normal text-text-primary"
      : "text-sm text-text-primary";
  return (
    <div className={className}>
      {showSectionTitle ? (
        <SectionLabel className="mb-1.5">{t("info.customProfileFields")}</SectionLabel>
      ) : null}
      <ul className={`space-y-2 ${textClass}`}>
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
