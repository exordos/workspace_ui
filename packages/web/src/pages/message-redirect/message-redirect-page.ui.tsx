import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { t } from "~/i18n/i18n";
import { isValidUrl } from "~/shared/lib/validation";
import { PageLoader } from "~/shared/ui/error-boundary";

const DECIMAL_MESSAGE_ID_RE = /^\d+$/;

function parseMessageIdParam(value: string | undefined): number | null {
  if (value == null || !DECIMAL_MESSAGE_ID_RE.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export const MessageRedirectPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { messageId } = useParams<{ messageId: string }>();

  const parsedMessageId = useMemo(() => parseMessageIdParam(messageId), [messageId]);

  const realmUri = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("realm");
    if (raw == null) {
      return undefined;
    }
    const normalizedRealm = raw.trim();
    return normalizedRealm.length > 0 && isValidUrl(normalizedRealm) ? normalizedRealm : undefined;
  }, [location.search]);

  useEffect(() => {
    if (parsedMessageId != null && realmUri) {
      const redirectTo = `${location.pathname}${location.search}`;
      void navigate(
        `/login?realm=${encodeURIComponent(realmUri)}&redirectTo=${encodeURIComponent(redirectTo)}`,
        { replace: true },
      );
    }
  }, [parsedMessageId, realmUri, navigate, location.pathname, location.search]);

  if (parsedMessageId != null && realmUri) {
    return <PageLoader />;
  }

  const error = parsedMessageId == null ? t("app.pageLoadError") : t("message.anchorAccessDenied");

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-muted">
      {error}
    </div>
  );
};
