import { describe, expect, it } from "vitest";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";
import type { LogEntry } from "~/shared/lib/logger";
import {
  collectDiagnosticsPageSnapshot,
  resolveDiagnosticsOverallStatus,
} from "./diagnostics-collect.lib";

const readyConnection: ConnectionHealthSnapshot = {
  phase: "ready",
  retryAfterMs: 0,
  lastFailureAt: null,
  reconnectAttempt: 0,
  failureReason: null,
  isReconnecting: false,
};

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
  it("collects runtime notification permission without push state", () => {
    const snapshot = collectDiagnosticsPageSnapshot({
      pathname: "/settings/logs",
      entries: [],
      filteredCount: 0,
      connection: readyConnection,
      rateLimitBlockedUntil: null,
      memorySnapshot: null,
      vitals: [],
      cache: null,
      realtimeStats: { eventsReceivedCount: 0, lastEventAt: null, lastEventType: null },
      sessionRemainingMs: null,
      authIdleTimeoutMs: null,
      currentUserUuid: "user-uuid-1",
      streamsCount: 2,
      conversationsCount: 1,
      foldersCount: 1,
      usersCount: 10,
      currentChatMessagesCount: 5,
      workspaceSessionsCount: 1,
      workspaceAccountId: "account-1",
      workspaceInstanceId: "instance-1",
      workspaceOrganizationOrigin: "https://workspace.example.com",
      workspaceProjectId: "project-1",
      workspaceUserUuid: "user-uuid-1",
      workspaceLogin: "user@example.com",
      workspaceOwnerKey: "owner-key-1",
      settingsLanguage: "en",
      themeMode: "dark",
      themePalette: "orange-warm",
      prioritizePersonalUnread: false,
      prioritizeUnmutedUnreadChannels: false,
      notificationSound: "default",
      folderRailLayout: "expanded",
    });

    expect(snapshot).not.toHaveProperty("push");
    expect(snapshot.realtime).not.toHaveProperty("eventQueueId");
    expect(snapshot.notifications.permission).toBe("unsupported");
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
      vitals: [],
      cache: null,
      realtimeStats: { eventsReceivedCount: 2, lastEventAt: Date.now(), lastEventType: "message" },
      sessionRemainingMs: 120_000,
      authIdleTimeoutMs: 86_400_000,
      currentUserUuid: null,
      streamsCount: 0,
      conversationsCount: 0,
      foldersCount: 0,
      usersCount: 0,
      currentChatMessagesCount: 0,
      workspaceSessionsCount: 0,
      workspaceAccountId: null,
      workspaceInstanceId: null,
      workspaceOrganizationOrigin: null,
      workspaceProjectId: null,
      workspaceUserUuid: null,
      workspaceLogin: null,
      workspaceOwnerKey: null,
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
