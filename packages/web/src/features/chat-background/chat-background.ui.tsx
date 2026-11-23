import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { selectMessengerConversationFromWorkspaceRoute } from "~/applications/messenger/model/messenger-ids.lib";
import { useTranslation } from "~/i18n/i18n";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { AppDialog } from "~/shared/ui/app-dialog";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { useChatBackground } from "./chat-background.hook";
import {
  BackgroundImageError,
  CHAT_BACKGROUNDS,
  chatBackgroundUrl,
  prepareChatBackground,
} from "./chat-background.lib";
import type { ChatBackgroundValue, ChatBackgroundError } from "./chat-background.lib";
import type { ReactNode } from "react";
const CLASS_NAME = "relative isolate flex min-h-0 flex-1 flex-col overflow-hidden";
export function ChatBackground({
  children,
  conversationId,
}: {
  readonly children: ReactNode;
  readonly conversationId: string;
}) {
  return <BackgroundSurface conversationId={conversationId}>{children}</BackgroundSurface>;
}
function BackgroundSurface({
  children,
  conversationId,
}: {
  readonly children: ReactNode;
  readonly conversationId: string;
}) {
  const { background } = useChatBackground(conversationId);
  const image = chatBackgroundUrl(background);
  return (
    <div
      className={CLASS_NAME}
      data-testid="chat-background"
      style={
        image
          ? {
              backgroundImage: `url(${JSON.stringify(image)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
export function ChatBackgroundSettings() {
  const location = useLocation();
  const selection = selectMessengerConversationFromWorkspaceRoute(
    parseWorkspaceMessengerRoute(location.pathname),
  );
  const conversationId = selection.status === "conversation" ? selection.conversationId : null;
  const settings = useChatBackground(conversationId);
  return (
    <BackgroundOptions
      key={`${settings.key}:${settings.runtimeGeneration}:${conversationId}`}
      conversationId={conversationId}
      settings={settings}
    />
  );
}
function BackgroundOptions({
  conversationId,
  settings,
}: {
  readonly conversationId: string | null;
  readonly settings: ReturnType<typeof useChatBackground>;
}) {
  const { t } = useTranslation();
  const { background, apply, available, isCurrent } = settings;
  const [error, setError] = useState<ChatBackgroundError | null>(null);
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<{ value: ChatBackgroundValue } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const fileHintId = useId();
  const focusTarget = useRef<HTMLElement | null>(null);
  const alive = useRef(false);
  const request = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const save = (scope: "all" | "chat") => {
    if (pending == null) return;
    try {
      apply(pending.value, scope);
      setPending(null);
      setError(null);
    } catch {
      setError("storage");
    }
  };
  const choose = (next: ChatBackgroundValue, trigger: HTMLElement) => {
    focusTarget.current = trigger;
    request.current++;
    setWorking(false);
    setError(null);
    setPending({ value: next });
  };
  const upload = async (file: File) => {
    const run = ++request.current;
    setWorking(true);
    setError(null);
    try {
      const image = await prepareChatBackground(file);
      if (alive.current && run === request.current && isCurrent()) setPending({ value: { image } });
    } catch (cause) {
      if (alive.current && run === request.current && isCurrent())
        setError(cause instanceof BackgroundImageError ? cause.code : "decode");
    } finally {
      if (alive.current && run === request.current && isCurrent()) setWorking(false);
    }
  };
  return (
    <div className="space-y-3 p-2" data-testid="chat-background-options">
      <p id={fileHintId} className="text-xs leading-5 text-text-secondary">
        {t("chatBackground.fileHint")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {CHAT_BACKGROUNDS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={!available}
            aria-pressed={
              background != null && "preset" in background && background.preset === item.id
            }
            onClick={(event) => choose({ preset: item.id }, event.currentTarget)}
            className="relative min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-bg text-text-primary outline-offset-2 transition-colors hover:border-accent focus-visible:outline-accent aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent"
          >
            <img src={item.image} alt="" className="aspect-[8/5] w-full object-cover" />
            <span className="block truncate px-2 py-1.5 text-xs leading-4">{t(item.label)}</span>
            {background != null && "preset" in background && background.preset === item.id ? (
              <span
                className="absolute right-1.5 top-1.5 rounded-full bg-accent p-0.5 text-on-accent"
                aria-hidden="true"
              >
                <Icon name="check" size={14} />
              </span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          aria-label={t(working ? "chatBackground.processing" : "chatBackground.add")}
          aria-describedby={fileHintId}
          disabled={working || !available}
          onClick={(event) => {
            focusTarget.current = event.currentTarget;
            input.current?.click();
          }}
          className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-bg text-sm text-text-primary outline-offset-2 hover:border-accent hover:bg-bg-elevated focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex aspect-[8/5] items-center justify-center">
            <Icon name="plus" size={28} />
          </span>
          <span className="block truncate px-2 py-1.5 text-xs leading-4" aria-live="polite">
            {t(working ? "chatBackground.processing" : "chatBackground.addShort")}
          </span>
        </button>
      </div>
      {background != null && "image" in background ? (
        <div className="flex items-center gap-3 rounded-lg border border-border-subtle p-2">
          <img
            src={background.image}
            alt={t("chatBackground.custom")}
            className="h-10 w-16 shrink-0 rounded object-cover"
          />
          <span className="min-w-0 text-xs text-text-primary">{t("chatBackground.custom")}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="neutral"
          appearance="ghost"
          className="text-text-primary"
          disabled={!available}
          onClick={(event) => choose(null, event.currentTarget)}
        >
          {t("chatBackground.reset")}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={t("chatBackground.file")}
        aria-describedby={fileHintId}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />
      {error && pending == null ? (
        <p className="text-sm text-danger" role="alert">
          {t(`chatBackground.errors.${error}`)}
        </p>
      ) : null}
      <AppDialog
        open={pending != null}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (focusTarget.current?.isConnected) focusTarget.current.focus();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setError(null);
          }
        }}
        title={t("chatBackground.applyTitle")}
        description={t("chatBackground.applyDescription")}
        maxWidthClassName="max-w-md"
        positionClassName="top-1/2 -translate-y-1/2"
        footer={
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr]">
            <Button
              type="button"
              variant="neutral"
              appearance="ghost"
              className="min-w-0 whitespace-nowrap"
              onClick={() => {
                setPending(null);
                setError(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="neutral"
              appearance="outline"
              className="min-w-0 whitespace-nowrap"
              disabled={conversationId == null}
              onClick={() => save("chat")}
            >
              {t("chatBackground.applyChat")}
            </Button>
            <Button type="button" className="min-w-0 whitespace-nowrap" onClick={() => save("all")}>
              {t("chatBackground.applyAll")}
            </Button>
          </div>
        }
      >
        {pending != null && chatBackgroundUrl(pending.value) ? (
          <img
            src={chatBackgroundUrl(pending.value)}
            alt={t("chatBackground.selectedPreview")}
            className="max-h-48 w-full rounded-lg object-cover"
          />
        ) : (
          <p className="text-sm text-text-secondary">{t("chatBackground.resetPreview")}</p>
        )}
        {conversationId == null ? (
          <p className="mt-2 text-sm text-text-secondary">{t("chatBackground.noChat")}</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {t(`chatBackground.errors.${error}`)}
          </p>
        ) : null}
      </AppDialog>
    </div>
  );
}
