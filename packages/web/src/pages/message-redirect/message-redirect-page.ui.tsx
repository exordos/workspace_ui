import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { t } from "~/i18n/i18n";
import { fetchMessageById } from "~/shared/api/zulip-messages";
import { getCurrentUser } from "~/shared/api/zulip-users";
import { buildRouteFromMessage, findInstanceIdByRealmUri } from "~/shared/lib/push-click";
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
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const setCurrentInstanceId = useInstancesStore((s) => s.setCurrentInstanceId);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const [error, setError] = useState<string | null>(null);

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
    let cancelled = false;
    if (parsedMessageId == null) {
      void Promise.resolve().then(() => {
        if (!cancelled) setError(t("app.pageLoadError"));
      });
      return () => {
        cancelled = true;
      };
    }

    const matchedInstanceId = findInstanceIdByRealmUri(instances, realmUri);
    if (realmUri && matchedInstanceId == null) {
      const redirectTo = `${location.pathname}${location.search}`;
      void navigate(
        `/login?realm=${encodeURIComponent(realmUri)}&redirectTo=${encodeURIComponent(redirectTo)}`,
        { replace: true },
      );
      return () => {
        cancelled = true;
      };
    }
    if (matchedInstanceId != null && matchedInstanceId !== currentInstanceId) {
      setCurrentInstanceId(matchedInstanceId);
      return () => {
        cancelled = true;
      };
    }

    const resolve = async () => {
      try {
        const resolvedCurrentUserId =
          currentUserId ?? (await getCurrentUser().then((u) => u?.user_id ?? null));
        const message = await fetchMessageById(parsedMessageId);
        if (cancelled) return;

        if (!message) {
          setError(t("message.anchorAccessDenied"));
          return;
        }

        const route = buildRouteFromMessage(message, resolvedCurrentUserId);
        if (!route) {
          setError(t("message.anchorAccessDenied"));
          return;
        }

        void navigate(route, { replace: true });
      } catch {
        if (cancelled) return;
        setError(t("message.anchorAccessDenied"));
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [
    parsedMessageId,
    instances,
    realmUri,
    currentInstanceId,
    setCurrentInstanceId,
    currentUserId,
    navigate,
    location.pathname,
    location.search,
  ]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-muted">
        {error}
      </div>
    );
  }

  return <PageLoader />;
};
