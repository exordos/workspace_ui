import { describe, expect, it } from "vitest";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import type { LogEntry } from "~/shared/lib/logger";
import {
  collectDiagnosticsPageSnapshot,
  resolveDiagnosticsOverallStatus,
  truncateQueueId,
} from "./diagnostics-collect.lib";

const readyConnection: ConnectionHealthSnapshot = {
  phase: "ready",
  retryAfterMs: 0,
  lastFailureAt: null,
  reconnectAttempt: 0,
  failureReason: null,
  isReconnecting: false,
};

/** Sample FCM token for redaction tests — not a real credential. */
const SAMPLE_PUSH_TOKEN = "abcdefghijklmnop";

function createEntry(partial: Partial<LogEntry> & Pick<LogEntry, "level" | "message">): LogEntry {
  return {
    timestamp: partial.timestamp ?? new Date().toISOString(),
    level: partial.level,
    scope: partial.scope ?? "test",
    runtime: partial.runtime ?? "browser",
    message: partial.message,
    data: partial.data,
  };
}

describe("resolveDiagnosticsOverallStatus", () => {
  it("returns offline when browser or connection is offline", () => {
    expect(resolveDiagnosticsOverallStatus(readyConnection, false, 0)).toBe("offline");
    expect(resolveDiagnosticsOverallStatus({ ...readyConnection, phase: "offline" }, true, 0)).toBe(
      "offline",
    );
  });

  it("returns degraded for non-ready phases or recent errors", () => {
    expect(
      resolveDiagnosticsOverallStatus({ ...readyConnection, phase: "connecting" }, true, 0),
    ).toBe("degraded");
    expect(resolveDiagnosticsOverallStatus(readyConnection, true, 2)).toBe("degraded");
  });

  it("returns healthy when connection is ready and no recent errors", () => {
    expect(resolveDiagnosticsOverallStatus(readyConnection, true, 0)).toBe("healthy");
  });
});

describe("collectDiagnosticsPageSnapshot", () => {
  it("does not include raw push token in snapshot", () => {
    const snapshot = collectDiagnosticsPageSnapshot({
      pathname: "/settings/logs",
      entries: [],
      filteredCount: 0,
      connection: readyConnection,
      rateLimitBlockedUntil: null,
      memorySnapshot: null,
      pushState: {
        permission: "granted",
        token: SAMPLE_PUSH_TOKEN,
        registered: true,
        provider: "fcm",
        registrationError: null,
      },
      vitals: [],
      cache: null,
      realtimeStats: { eventsReceivedCount: 0, lastEventAt: null, lastEventType: null },
      sessionRemainingMs: null,
      authIdleTimeoutMs: null,
      currentUserId: 1,
      streamsCount: 2,
      dmsCount: 1,
      usersCount: 10,
      currentChatMessagesCount: 5,
      currentInstanceId: "inst-1",
      currentRealm: "https://zulip.example.com",
      currentEmail: "user@example.com",
      instancesCount: 1,
      unreadCountsByInstance: { "inst-1": 3 },
      settingsLanguage: "en",
      themeMode: "dark",
      themePalette: "orange-warm",
      prioritizePersonalUnread: false,
      prioritizeUnmutedUnreadChannels: false,
      notificationSound: "default",
      folderRailLayout: "expanded",
    });

    expect(snapshot.push.tokenPrefix).toBe("abcdefgh…");
    expect(JSON.stringify(snapshot)).not.toContain(SAMPLE_PUSH_TOKEN);
  });

  it("collects recent errors from log entries", () => {
    const snapshot = collectDiagnosticsPageSnapshot({
      pathname: "/settings/logs",
      entries: [
        createEntry({ level: "error", message: "boom", scope: "api" }),
        createEntry({ level: "info", message: "ok" }),
      ],
      filteredCount: 2,
      connection: readyConnection,
      rateLimitBlockedUntil: null,
      memorySnapshot: null,
      pushState: {
        permission: "default",
        token: null,
        registered: false,
        provider: null,
        registrationError: null,
      },
      vitals: [],
      cache: null,
      realtimeStats: { eventsReceivedCount: 2, lastEventAt: Date.now(), lastEventType: "message" },
      sessionRemainingMs: 120_000,
      authIdleTimeoutMs: 86_400_000,
      currentUserId: null,
      streamsCount: 0,
      dmsCount: 0,
      usersCount: 0,
      currentChatMessagesCount: 0,
      currentInstanceId: null,
      currentRealm: null,
      currentEmail: null,
      instancesCount: 0,
      unreadCountsByInstance: {},
      settingsLanguage: "en",
      themeMode: "dark",
      themePalette: "orange-warm",
      prioritizePersonalUnread: false,
      prioritizeUnmutedUnreadChannels: false,
      notificationSound: "default",
      folderRailLayout: "expanded",
    });

    expect(snapshot.logs.recentErrors).toHaveLength(1);
    expect(snapshot.logs.recentErrors[0]?.message).toBe("boom");
    expect(snapshot.overallStatus).toBe("degraded");
  });
});

describe("truncateQueueId", () => {
  it("truncates long queue ids", () => {
    expect(truncateQueueId("abcdefghijklmnop", 8)).toBe("abcdefgh…");
  });
});
