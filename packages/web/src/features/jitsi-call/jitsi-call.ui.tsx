// Этот файл описывает основную UI-оболочку Jitsi-звонка.
// Он отвечает за стабильный host для Jitsi, за переключение между expanded и PiP режимами
// и за то, чтобы shell-ререндеры не пересоздавали саму Jitsi-сессию.

import { JitsiMeeting } from "@jitsi/react-sdk";
import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { useCallParticipantsStore } from "~/entities/call/call.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { JITSI_PARTICIPANTS_POLL_MS } from "~/shared/config/constants";
import { callState } from "~/shared/lib/call-state";
import { parseJitsiUrl } from "~/shared/lib/jitsi";
import { Icon } from "~/shared/ui/icon";
import { configureJitsiIframe } from "./jitsi-call-permissions.lib";
import { getDefaultPipWindowBounds, type PipWindowBounds } from "./jitsi-call-pip.lib";
import { parseJitsiMeetingUrlLoose } from "./jitsi-call-url.lib";
import { useJitsiParticipantCount } from "./jitsi-participant-count.hook";
import type { JitsiCallModalProps, JitsiExternalApiWithParticipants } from "./jitsi-call.types";

// Минимальная ширина floating PiP-окна, ниже которой звонком уже неудобно пользоваться.
const MIN_WINDOW_WIDTH = 280;
// Минимальная высота floating PiP-окна, чтобы embed не схлопывался в нечитаемый прямоугольник.
const MIN_WINDOW_HEIGHT = 180;
// Отступ от краёв viewport на мобильных/узких экранах для expanded-режима.
const MOBILE_INSET = 16;
// Более свободный отступ для desktop-режима, чтобы большая модалка не прилипала к краям.
const DESKTOP_INSET = 32;
// На этой ширине считаем экран desktop-like и применяем desktop inset.
const DESKTOP_BREAKPOINT = 640;
// Базовая конфигурация Jitsi, которая относится к самой сессии звонка.
// Она должна оставаться стабильной и не зависеть от minimize/expand состояния.
const JITSI_CONFIG_OVERWRITE = {
  startWithAudioMuted: true,
  startWithVideoMuted: true,
  prejoinConfig: { enabled: false },
} as const;
// Настройки интерфейса Jitsi, которые не должны меняться из-за оболочки модалки.
const JITSI_INTERFACE_CONFIG_OVERWRITE = {
  DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
} as const;
// Внешний контейнер Dialog.Content всегда занимает весь viewport,
// а само окно внутри него уже управляется через Rnd.
const OUTER_DIALOG_CLASS_NAME =
  "fixed inset-0 z-modal border-0 bg-transparent p-0 shadow-none outline-none pointer-events-none";
// Это общий visual shell окна звонка. Он один и тот же и для expanded, и для PiP режима.
const WINDOW_CLASS_NAME =
  "pointer-events-auto flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl";

// Это минимальный shape viewport, от которого рассчитываются размеры expanded-окна.
interface ViewportSize {
  width: number;
  height: number;
}

// Эти props описывают только session-level данные, необходимые самому embed-компоненту.
// Shell-состояние вроде minimized, fullscreen или bounds сюда специально не попадает.
interface JitsiCallEmbedProps {
  displayName: string;
  domain: string | null;
  roomName: string | null;
  onApiReady: (api: JitsiExternalApiWithParticipants) => void;
  onIframeReady: (ref: HTMLElement | null) => void;
  onReadyToClose: () => void;
}

// Этот memoized-компонент изолирует сам Jitsi embed от ререндеров оболочки.
// Пока не меняются session-level props, minimize/expand и resize не должны создавать новый embed.
const JitsiCallEmbed: React.FC<JitsiCallEmbedProps> = React.memo(function JitsiCallEmbed({
  displayName,
  domain,
  roomName,
  onApiReady,
  onIframeReady,
  onReadyToClose,
}) {
  if (domain == null || roomName == null) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
        {t("call.invalidLink")}
      </div>
    );
  }

  return (
    <JitsiMeeting
      domain={domain}
      roomName={roomName}
      onApiReady={onApiReady}
      getIFrameRef={onIframeReady}
      onReadyToClose={onReadyToClose}
      userInfo={{ displayName, email: "" }}
      configOverwrite={JITSI_CONFIG_OVERWRITE}
      interfaceConfigOverwrite={JITSI_INTERFACE_CONFIG_OVERWRITE}
    />
  );
});

// Возвращает актуальный размер viewport для расчёта expanded-режима.
// На сервере отдаём безопасный fallback, чтобы не зависеть от window во время инициализации.
function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return {
      width: 1280,
      height: 720,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

// Рассчитывает bounds для большого режима звонка.
// Здесь логика отделена от PiP, чтобы большая модалка и плавающее окно не смешивали свои правила.
function getExpandedWindowBounds(viewportSize: ViewportSize): PipWindowBounds {
  const inset =
    viewportSize.width >= DESKTOP_BREAKPOINT && viewportSize.height >= DESKTOP_BREAKPOINT
      ? DESKTOP_INSET
      : MOBILE_INSET;

  return {
    x: inset,
    y: inset,
    width: Math.max(MIN_WINDOW_WIDTH, viewportSize.width - inset * 2),
    height: Math.max(MIN_WINDOW_HEIGHT, viewportSize.height - inset * 2),
  };
}

// Главный shell-компонент звонка.
// Он управляет только оболочкой окна и session lifecycle вокруг embed, но не должен заставлять
// Jitsi пересоздаваться при обычных UI-переключениях.
export const JitsiCallModal: React.FC<JitsiCallModalProps> = ({
  open,
  meetingUrl,
  locationName,
  onClose,
}) => {
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const callLocationNameRef = useRef(locationName?.trim() ?? "");
  const participantPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [pipWindowBounds, setPipWindowBounds] =
    useState<PipWindowBounds>(getDefaultPipWindowBounds);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(getViewportSize);
  // meetingUrl — единственная граница сессии для embed.
  // Мемоизация только по URL гарантирует, что shell-ререндеры не выглядят как новая встреча.
  const parsedMeeting = useMemo(
    () =>
      meetingUrl ? (parseJitsiUrl(meetingUrl) ?? parseJitsiMeetingUrlLoose(meetingUrl)) : null,
    [meetingUrl],
  );
  const parsedDomain = parsedMeeting?.domain ?? null;
  const parsedRoomName = parsedMeeting?.roomName ?? null;
  const { participantCount, onApiReady: onParticipantCountApiReady } =
    useJitsiParticipantCount(open);
  const setParticipants = useCallParticipantsStore((s) => s.setParticipants);
  const clearParticipants = useCallParticipantsStore((s) => s.clearParticipants);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const getUser = useUsersStore((s) => s.getUser);
  const currentUser = currentUserId != null ? getUser(currentUserId) : undefined;
  const trimmedDisplayName = currentUser?.full_name?.trim();
  const displayName =
    trimmedDisplayName != null && trimmedDisplayName.length > 0
      ? trimmedDisplayName
      : t("call.participant");
  const callLocationName = locationName?.trim() ?? "";
  const expandedWindowBounds = useMemo(() => getExpandedWindowBounds(viewportSize), [viewportSize]);
  const windowBounds = isMinimized ? pipWindowBounds : expandedWindowBounds;

  useEffect(() => {
    // Храним актуальный onClose в ref, чтобы callbacks внутри Jitsi и shell не зависели
    // от каждого нового render и не тянули за собой повторную инициализацию embed.
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Отдельно держим последнее отображаемое имя локации в ref,
    // чтобы session-level эффекты читали актуальное значение без лишних deps.
    callLocationNameRef.current = callLocationName;
  }, [callLocationName]);

  // Очищает polling списка участников перед новой подпиской и при завершении звонка.
  // Это защищает от параллельных interval после повторного onApiReady.
  const clearParticipantPolling = useCallback(() => {
    if (participantPollIntervalRef.current != null) {
      clearInterval(participantPollIntervalRef.current);
      participantPollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Expanded-режим пересчитывается от viewport, поэтому слушаем resize окна браузера.
    const handleResize = () => {
      setViewportSize(getViewportSize());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (open && parsedRoomName != null) {
      // При открытии активной сессии синхронизируем глобальный callState только от session данных.
      const activeDisplayName = callLocationNameRef.current;
      callState.start({
        roomName: parsedRoomName,
        participants: 1,
        displayName: activeDisplayName.length > 0 ? activeDisplayName : undefined,
      });
      return () => {
        callState.end();
        clearParticipantPolling();
        clearParticipants(meetingUrl);
      };
    }

    // Когда звонок закрыт, shell обязан вернуть локальное состояние в начальное значение
    // и очистить все session-level побочные эффекты.
    callState.end();
    clearParticipantPolling();
    if (meetingUrl.length > 0) {
      clearParticipants(meetingUrl);
    }
    void Promise.resolve().then(() => {
      setIsMinimized(false);
      setIsNativeFullscreen(false);
      setPipWindowBounds(getDefaultPipWindowBounds());
    });
    if (document.fullscreenElement === fullscreenRef.current) {
      const fullscreenExitPromise = document.exitFullscreen?.();
      if (fullscreenExitPromise != null) {
        void fullscreenExitPromise.catch(() => {});
      }
    }
    return undefined;
  }, [open, meetingUrl, parsedRoomName, clearParticipants, clearParticipantPolling]);

  useEffect(() => {
    // Fullscreen живёт полностью в оболочке окна и не должен влиять на lifecycle embed.
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === fullscreenRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      // Закрытие по механике Dialog трактуем как переход в PiP, а не как завершение звонка.
      if (!nextOpen && !isMinimized) {
        setIsMinimized(true);
      }
    },
    [isMinimized],
  );

  // Получаем ссылку на iframe и настраиваем его только инвариантным способом.
  // Здесь нет зависимости от minimized, чтобы shell-переключения не влияли на Jitsi session.
  const handleIframeReady = useCallback((ref: HTMLElement | null) => {
    iframeRef.current = ref;
    configureJitsiIframe(ref);
  }, []);

  // Jitsi сигнализирует о завершении звонка изнутри, а наружу мы проксируем только актуальный onClose.
  const handleReadyToClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  // После готовности Jitsi API обновляем participant state и пересобираем polling с нуля.
  // Сначала чистим старый interval, чтобы повторные api-ready или внутренние переподписки
  // не оставляли за собой конкурирующие обновления участников.
  const handleApiReady = useCallback(
    (api: JitsiExternalApiWithParticipants) => {
      clearParticipantPolling();
      onParticipantCountApiReady(api);

      const updateParticipants = () => {
        try {
          const list = api.getParticipantsInfo?.() ?? [];
          const participants = list.map(
            (participant: { displayName?: string; displayname?: string }) => ({
              displayName:
                participant.displayName ?? participant.displayname ?? t("call.participant"),
            }),
          );
          setParticipants(meetingUrl, participants);
        } catch {
          // ignore
        }
      };

      updateParticipants();
      participantPollIntervalRef.current = setInterval(
        updateParticipants,
        JITSI_PARTICIPANTS_POLL_MS,
      );

      // callState должен знать только итоговое число участников, независимо от UI-режима окна.
      const syncCallState = () => {
        const nextParticipantCount = api.getNumberOfParticipants?.();
        if (typeof nextParticipantCount === "number") {
          callState.updateParticipants(nextParticipantCount);
        }
      };

      syncCallState();
      api.on("participantJoined", syncCallState);
      api.on("participantLeft", syncCallState);
    },
    [clearParticipantPolling, meetingUrl, onParticipantCountApiReady, setParticipants],
  );

  // Включает и выключает browser fullscreen только для shell-контейнера модалки.
  // Сам embed не должен размонтироваться из-за fullscreen-переключения.
  const toggleNativeFullscreen = useCallback(async () => {
    if (fullscreenRef.current == null) return;

    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen?.();
      } else {
        await fullscreenRef.current.requestFullscreen?.();
      }
    } catch {
      // Fullscreen API not supported or denied (e.g. not from user gesture in some browsers).
    }
  }, []);

  // Переключает shell между expanded и PiP режимами.
  // При этом Jitsi остаётся на том же месте в дереве, а меняется только поведение окна.
  const toggleMinimized = useCallback(() => {
    if (isMinimized) {
      setIsMinimized(false);
      return;
    }

    setIsMinimized(true);
    if (document.fullscreenElement === fullscreenRef.current) {
      const fullscreenExitPromise = document.exitFullscreen?.();
      if (fullscreenExitPromise != null) {
        void fullscreenExitPromise.catch(() => {});
      }
    }
  }, [isMinimized]);

  const callName = callLocationName.length > 0 ? callLocationName : (parsedRoomName ?? "");
  const headerTitle =
    callName.length > 0
      ? `${t("call.call")} - ${callName}`
      : participantCount !== null
        ? t("call.callWithParticipants", { count: participantCount })
        : t("call.call");
  const headerSubtitle =
    participantCount !== null ? t("call.participants", { count: participantCount }) : undefined;

  // Dialog.Root держим в стабильном режиме, чтобы minimize/expand не менял внутренний lifecycle Radix
  // и не создавал косвенный remount Jitsi subtree.
  // Rnd тоже остаётся смонтированным всегда: окно меняет только bounds и интерактивность,
  // а не host-контейнер Jitsi.
  return (
    <Dialog.Root open={open} modal={false} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        {!isMinimized ? (
          <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        ) : null}
        <Dialog.Content
          forceMount
          className={`${OUTER_DIALOG_CLASS_NAME} data-[state=closed]:hidden`}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (!isMinimized) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (!isMinimized) {
              event.preventDefault();
            }
          }}
        >
          <Rnd
            position={{ x: windowBounds.x, y: windowBounds.y }}
            size={{ width: windowBounds.width, height: windowBounds.height }}
            minWidth={MIN_WINDOW_WIDTH}
            minHeight={MIN_WINDOW_HEIGHT}
            bounds={isMinimized ? "body" : "window"}
            disableDragging={!isMinimized}
            enableResizing={isMinimized}
            className={isMinimized ? "pointer-events-auto z-pip" : "pointer-events-auto"}
            onDragStop={(_event, data) => {
              if (!isMinimized) return;
              setPipWindowBounds((currentBounds) => ({
                ...currentBounds,
                x: data.x,
                y: data.y,
              }));
            }}
            onResizeStop={(_event, _direction, ref, _delta, position) => {
              if (!isMinimized) return;
              setPipWindowBounds({
                x: position.x,
                y: position.y,
                width: ref.offsetWidth,
                height: ref.offsetHeight,
              });
            }}
          >
            <div
              ref={fullscreenRef}
              className={WINDOW_CLASS_NAME}
              data-testid={isMinimized ? "jitsi-pip-content" : "jitsi-call-window"}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-2 py-1.5 sm:px-4 sm:py-2">
                <div className="min-w-0">
                  <Dialog.Title asChild>
                    <span className="block min-w-0 truncate text-xs font-semibold text-text-primary sm:text-sm">
                      {headerTitle}
                    </span>
                  </Dialog.Title>
                  {headerSubtitle ? (
                    <Dialog.Description asChild>
                      <span className="block min-w-0 truncate text-[11px] text-text-muted">
                        {headerSubtitle}
                      </span>
                    </Dialog.Description>
                  ) : (
                    <Dialog.Description className="sr-only">{t("call.call")}</Dialog.Description>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {!isMinimized ? (
                    <button
                      type="button"
                      onClick={toggleNativeFullscreen}
                      className="hover:bg-bg/50 rounded-lg p-1.5 text-text-muted hover:text-text-primary sm:p-2"
                      aria-label={
                        isNativeFullscreen ? t("call.fullscreenExit") : t("call.fullscreenEnter")
                      }
                      title={
                        isNativeFullscreen ? t("call.fullscreenExit") : t("call.fullscreenEnter")
                      }
                    >
                      <Icon
                        name={isNativeFullscreen ? "fullscreen_exit" : "fullscreen"}
                        size={18}
                        className="text-current"
                      />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleMinimized}
                    className="hover:bg-bg/50 rounded-lg p-1.5 text-text-muted hover:text-text-primary sm:p-2"
                    aria-label={isMinimized ? t("call.expand") : t("call.minimize")}
                    title={isMinimized ? t("call.expand") : t("call.minimizeToWindow")}
                  >
                    <Icon
                      name={isMinimized ? "chevron-up" : "chevron-down"}
                      size={18}
                      className="text-current"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="hover:bg-bg/50 rounded-lg p-1.5 text-text-muted hover:text-text-primary sm:p-2"
                    aria-label={t("call.closeCall")}
                  >
                    <Icon name="close" size={18} className="text-current" />
                  </button>
                </div>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <JitsiCallEmbed
                  displayName={displayName}
                  domain={parsedDomain}
                  roomName={parsedRoomName}
                  onApiReady={handleApiReady}
                  onIframeReady={handleIframeReady}
                  onReadyToClose={handleReadyToClose}
                />
              </div>
            </div>
          </Rnd>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
