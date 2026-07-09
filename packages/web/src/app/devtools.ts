/**
 * Development tools — exposed on window.__dev__ in dev mode.
 *
 * Access from browser console:
 *   __dev__.help()
 *   __dev__.setPipelineTrace("chat-list")
 *   __dev__.setLogLevel("debug")
 *   __dev__.logs("error")
 */

import { useCallParticipantsStore } from "~/entities/call/call.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
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
import {
  getPipelineTrace,
  setPipelineTrace,
  type PipelineTraceChannel,
} from "~/shared/lib/pipeline-trace.lib";
import { useSidebarConfigStore } from "~/widgets/sidebar/sidebar-config.model";

interface DevTools {
  stores: {
    messenger: typeof useMessengerStore;
    messages: typeof useWorkspaceMessageStore;
    users: typeof useUsersStore;
    workspaceAuth: typeof useWorkspaceAuthStore;
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
  setPipelineTrace: (
    channels: "off" | "all" | PipelineTraceChannel | PipelineTraceChannel[],
  ) => void;
  getPipelineTrace: typeof getPipelineTrace;
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
      messenger: useMessengerStore,
      messages: useWorkspaceMessageStore,
      users: useUsersStore,
      workspaceAuth: useWorkspaceAuthStore,
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
    setPipelineTrace,
    getPipelineTrace,

    help: () => {
      /* eslint-disable no-console */
      console.log("%c🔧 Workspace DevTools", "font-size: 16px; font-weight: bold; color: #ff8438");
      console.log(`
Log scopes: app, api, realtime, connection-health, action, store:<name>, trace:*, perf, console

  __dev__.setLogLevel("debug")       — show debug in console (store, API, traces)
  __dev__.setPipelineTrace("all")    — pipeline traces: messages | chat-list | sidebar-unread | folders | link-preview
  __dev__.getPipelineTrace()         — current trace channels
  __dev__.logs() / __dev__.logs("error")
  __dev__.clearLogs()

  __dev__.stores.<name>.getState()   — Zustand store snapshot
  __dev__.theme.toggle() / __dev__.theme.setPalette("blue-cold")
  __dev__.i18n.setLocale("en")
  __dev__.perf.startTimer("label")

Stores: messenger, messages, users, workspaceAuth, theme, sidebar, callParticipants
      `);
      /* eslint-enable no-console */
    },
  };

  (window as unknown as { __dev__: DevTools }).__dev__ = devtools;

  /* eslint-disable no-console */
  console.log(
    "%c🔧 DevTools — type __dev__.help() for commands",
    "color: #ff8438; font-weight: bold",
  );
  /* eslint-enable no-console */
}
