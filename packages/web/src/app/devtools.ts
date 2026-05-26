/**
 * Development tools — exposed on window.__dev__ in dev mode.
 *
 * Access from browser console:
 *   __dev__.stores.chatList.getState()
 *   __dev__.stores.users.getState().getUser(42)
 *   __dev__.logs()
 *   __dev__.logs("error")
 *   __dev__.clearLogs()
 *   __dev__.env
 *   __dev__.perf.startTimer("test")
 *   __dev__.setLocale("en")
 *   __dev__.theme.setPalette("blue-cold")
 */

import { useCallParticipantsStore } from "~/entities/call/call.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useUsersStore } from "~/entities/user/user.model";
import { t, setLocale, getLocale, getSupportedLocales } from "~/i18n/i18n";
import { initConsoleCapture } from "~/shared/lib/console-capture.lib";
import { env } from "~/shared/lib/env";
import {
  getLogHistory,
  clearLogHistory,
  setMinLevel,
  type LogLevel,
  type LogEntry,
} from "~/shared/lib/logger";
import { perf } from "~/shared/lib/perf";
import { useSidebarConfigStore } from "~/widgets/sidebar/sidebar-config.model";

interface DevTools {
  stores: {
    chatList: typeof useChatListStore;
    messages: typeof useCurrentChatMessagesStore;
    users: typeof useUsersStore;
    instances: typeof useInstancesStore;
    theme: typeof useThemeStore;
    sidebar: typeof useSidebarConfigStore;
    callParticipants: typeof useCallParticipantsStore;
  };
  env: typeof env;
  perf: typeof perf;
  theme: {
    setPalette: (id: string) => void;
    setMode: (mode: "light" | "dark" | "system") => void;
    toggle: () => void;
    current: () => { palette: string; mode: string };
  };
  i18n: {
    t: typeof t;
    setLocale: typeof setLocale;
    getLocale: typeof getLocale;
    locales: ReturnType<typeof getSupportedLocales>;
  };
  logs: (level?: LogLevel) => readonly LogEntry[];
  clearLogs: typeof clearLogHistory;
  setLogLevel: typeof setMinLevel;
  help: () => void;
}

let consoleCaptureCleanup: (() => void) | undefined;

export function installDevTools(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;

  consoleCaptureCleanup?.();
  consoleCaptureCleanup = initConsoleCapture();

  const devtools: DevTools = {
    stores: {
      chatList: useChatListStore,
      messages: useCurrentChatMessagesStore,
      users: useUsersStore,
      instances: useInstancesStore,
      theme: useThemeStore,
      sidebar: useSidebarConfigStore,
      callParticipants: useCallParticipantsStore,
    },

    env,
    perf,

    theme: {
      setPalette: (id) => useThemeStore.getState().setPalette(id),
      setMode: (mode) => useThemeStore.getState().setMode(mode),
      toggle: () => useThemeStore.getState().toggleMode(),
      current: () => ({
        palette: useThemeStore.getState().paletteId,
        mode: useThemeStore.getState().mode,
      }),
    },

    i18n: {
      t,
      setLocale,
      getLocale,
      locales: getSupportedLocales(),
    },

    logs: (level?: LogLevel) => {
      const all = getLogHistory();
      if (!level) return all;
      return all.filter((e) => e.level === level);
    },
    clearLogs: clearLogHistory,
    setLogLevel: setMinLevel,

    help: () => {
      /* eslint-disable no-console */
      console.log("%c🔧 Workspace DevTools", "font-size: 16px; font-weight: bold; color: #ff8438");
      console.log(`
Available commands:

  __dev__.stores.<name>.getState()   — inspect any Zustand store
  __dev__.stores.users.getState().getUser(42)

  __dev__.logs()                     — last 500 log entries
  __dev__.logs("error")              — only errors
  __dev__.clearLogs()                — clear log buffer
  __dev__.setLogLevel("debug")       — change min log level

  __dev__.theme.toggle()             — switch dark/light
  __dev__.theme.setPalette("blue-cold")
  __dev__.theme.current()

  __dev__.i18n.setLocale("en")       — switch language
  __dev__.i18n.t("auth.login")       — test translation key

  __dev__.env                        — all environment variables
  __dev__.perf.startTimer("label")   — start performance timer

Stores: chatList, messages, users, instances, theme, sidebar, callParticipants
      `);
      /* eslint-enable no-console */
    },
  };

  (window as unknown as { __dev__: DevTools }).__dev__ = devtools;

  /* eslint-disable no-console */
  console.log(
    "%c🔧 DevTools ready — type __dev__.help() for commands",
    "color: #ff8438; font-weight: bold",
  );
  /* eslint-enable no-console */
}
