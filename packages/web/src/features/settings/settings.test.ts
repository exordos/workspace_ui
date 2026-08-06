/**
 * Tests for the settings feature — localStorage persistence,
 * individual setting updates, and reset to defaults.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { configureI18nStorageScope, getLocale, setLocale } from "~/i18n/i18n";
import { configureWorkspaceI18nStorageScope } from "~/widgets/layout/layout-i18n-scope.lib";
import { useSettingsStore } from "./settings.model";

function resetWorkspaceSessionScope(): void {
  useWorkspaceAuthStore.setState({
    sessions: [],
    currentAccountId: null,
    runtimeGeneration: 0,
  });
}

function createSession(id: "a" | "b"): WorkspaceAuthSession {
  return {
    accountId: `account-${id}`,
    instanceId: `instance-${id}`,
    organizationId: `org-${id}`,
    organizationOrigin: `https://org-${id}.example.com`,
    projectId: `project-${id}`,
    userUuid: `user-${id}`,
    accessToken: `access-token-${id}`,
    refreshToken: `refresh-token-${id}`,
    runtimeGeneration: 1,
    login: `user-${id}@example.com`,
    profile: {
      uuid: `user-${id}`,
      username: `user-${id}`,
      firstName: "User",
      lastName: id.toUpperCase(),
      email: `user-${id}@example.com`,
    },
  };
}

function setWorkspaceSessionScope(currentAccountId: "account-a" | "account-b"): {
  sessionA: WorkspaceAuthSession;
  sessionB: WorkspaceAuthSession;
} {
  const sessionA = createSession("a");
  const sessionB = createSession("b");
  useWorkspaceAuthStore.setState({
    sessions: [sessionA, sessionB],
    currentAccountId,
    runtimeGeneration: 1,
  });
  return { sessionA, sessionB };
}

describe("useSettingsStore", () => {
  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
    resetWorkspaceSessionScope();
    configureI18nStorageScope();
    setLocale("en");
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
  });

  describe("initial state", () => {
    it("starts with default settings", () => {
      const state = useSettingsStore.getState();
      expect(state.prioritizePersonalUnread).toBe(false);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
      expect(state.messengerSidebarSortMode).toBe("last_message");
      expect(state.notificationSound).toBe("default");
      expect(state.language).toBe("en");
      expect(state.folderRailLayout).toBe("vertical");
      expect(state.showSystemFolders).toBe(true);
      expect(state.chatListDensity).toBe("standard");
      expect(state.authIdleTimeout).toBe("3d");
    });
  });

  describe("unread-priority flags", () => {
    it("toggles prioritizePersonalUnread", () => {
      useSettingsStore.getState().setPrioritizePersonalUnread(true);

      let state = useSettingsStore.getState();
      expect(state.prioritizePersonalUnread).toBe(true);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(false);

      useSettingsStore.getState().setPrioritizePersonalUnread(false);
      state = useSettingsStore.getState();
      expect(state.prioritizePersonalUnread).toBe(false);
    });

    it("toggles prioritizeUnmutedUnreadChannels and persists", () => {
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(true);

      const state = useSettingsStore.getState();
      expect(state.prioritizeUnmutedUnreadChannels).toBe(true);

      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.prioritizeUnmutedUnreadChannels).toBe(true);
    });
  });

  describe("messenger sidebar sort mode", () => {
    it("switches to unread-first mode and persists it", () => {
      useSettingsStore.getState().setMessengerSidebarSortMode("unread_first");

      expect(useSettingsStore.getState().messengerSidebarSortMode).toBe("unread_first");
      const raw = localStorage.getItem("workspace-settings");
      expect(JSON.parse(raw!).messengerSidebarSortMode).toBe("unread_first");
    });
  });

  describe("setNotificationSound", () => {
    it("updates notification sound", () => {
      useSettingsStore.getState().setNotificationSound("subtle");
      expect(useSettingsStore.getState().notificationSound).toBe("subtle");
    });

    it("sets to none", () => {
      useSettingsStore.getState().setNotificationSound("none");
      expect(useSettingsStore.getState().notificationSound).toBe("none");
    });
  });

  describe("setLanguage", () => {
    it("changes language to Russian", () => {
      useSettingsStore.getState().setLanguage("ru");
      expect(useSettingsStore.getState().language).toBe("ru");
    });
  });

  describe("resetToDefaults", () => {
    it("restores all settings to defaults", () => {
      useSettingsStore.getState().setPrioritizePersonalUnread(true);
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(true);
      useSettingsStore.getState().setNotificationSound("none");
      useSettingsStore.getState().setLanguage("ru");
      useSettingsStore.getState().setShowSystemFolders(true);
      useSettingsStore.getState().setChatListDensity("compact");
      useSettingsStore.getState().setAuthIdleTimeout("never");

      useSettingsStore.getState().resetToDefaults();

      const state = useSettingsStore.getState();
      expect(state.prioritizePersonalUnread).toBe(false);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
      expect(state.messengerSidebarSortMode).toBe("last_message");
      expect(state.notificationSound).toBe("default");
      expect(state.language).toBe("en");
      expect(state.showSystemFolders).toBe(true);
      expect(state.chatListDensity).toBe("standard");
      expect(state.authIdleTimeout).toBe("3d");
    });

    it("persists defaults to localStorage", () => {
      useSettingsStore.getState().setPrioritizePersonalUnread(true);
      useSettingsStore.getState().resetToDefaults();

      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.prioritizePersonalUnread).toBe(false);
      expect(parsed.prioritizeUnmutedUnreadChannels).toBe(false);
      expect(parsed.messengerSidebarSortMode).toBe("last_message");
      expect(parsed.authIdleTimeout).toBe("3d");
    });
  });

  describe("setNotificationSound persistence", () => {
    it("persists notification sound to localStorage", () => {
      useSettingsStore.getState().setNotificationSound("subtle");
      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.notificationSound).toBe("subtle");
    });
  });

  describe("setLanguage persistence", () => {
    it("persists language to localStorage", () => {
      useSettingsStore.getState().setLanguage("ru");
      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.language).toBe("ru");
    });
  });

  describe("setFolderRailLayout", () => {
    it("updates folder rail layout", () => {
      useSettingsStore.getState().setFolderRailLayout("horizontal");
      expect(useSettingsStore.getState().folderRailLayout).toBe("horizontal");
    });

    it("persists folder rail layout to localStorage", () => {
      useSettingsStore.getState().setFolderRailLayout("horizontal");
      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.folderRailLayout).toBe("horizontal");
    });
  });

  describe("setShowSystemFolders", () => {
    it("updates showSystemFolders flag", () => {
      useSettingsStore.getState().setShowSystemFolders(true);
      expect(useSettingsStore.getState().showSystemFolders).toBe(true);
    });

    it("persists showSystemFolders flag to localStorage", () => {
      useSettingsStore.getState().setShowSystemFolders(true);
      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.showSystemFolders).toBe(true);
    });
  });

  describe("setChatListDensity", () => {
    it("updates chat list density", () => {
      useSettingsStore.getState().setChatListDensity("compact");
      expect(useSettingsStore.getState().chatListDensity).toBe("compact");
    });

    it("persists chat list density to localStorage", () => {
      useSettingsStore.getState().setChatListDensity("compact");
      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.chatListDensity).toBe("compact");
    });
  });

  describe("setAuthIdleTimeout", () => {
    it("updates auth idle timeout", () => {
      useSettingsStore.getState().setAuthIdleTimeout("7d");
      expect(useSettingsStore.getState().authIdleTimeout).toBe("7d");
    });

    it("sets to never", () => {
      useSettingsStore.getState().setAuthIdleTimeout("never");
      expect(useSettingsStore.getState().authIdleTimeout).toBe("never");
    });

    it("persists auth idle timeout to localStorage", () => {
      useSettingsStore.getState().setAuthIdleTimeout("12h");
      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.authIdleTimeout).toBe("12h");
    });
  });

  describe("combined persistence", () => {
    it("all settings persist together correctly", () => {
      useSettingsStore.getState().setPrioritizePersonalUnread(true);
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(false);
      useSettingsStore.getState().setNotificationSound("none");
      useSettingsStore.getState().setLanguage("ru");
      useSettingsStore.getState().setFolderRailLayout("horizontal");
      useSettingsStore.getState().setShowSystemFolders(true);
      useSettingsStore.getState().setChatListDensity("compact");
      useSettingsStore.getState().setAuthIdleTimeout("7d");

      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.prioritizePersonalUnread).toBe(true);
      expect(parsed.prioritizeUnmutedUnreadChannels).toBe(false);
      expect(parsed.notificationSound).toBe("none");
      expect(parsed.language).toBe("ru");
      expect(parsed.folderRailLayout).toBe("horizontal");
      expect(parsed.showSystemFolders).toBe(true);
      expect(parsed.chatListDensity).toBe("compact");
      expect(parsed.authIdleTimeout).toBe("7d");
    });
  });

  describe("workspace owner scope", () => {
    it("persists settings under the active workspace owner key", () => {
      const { sessionA } = setWorkspaceSessionScope("account-a");
      const ownerKey = workspaceRuntimeOwnerKey(sessionA);

      useSettingsStore.getState().setNotificationSound("subtle");

      const raw = localStorage.getItem(`workspace-settings:${ownerKey}`);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.notificationSound).toBe("subtle");
      expect(parsed.authIdleTimeout).toBe("3d");
      expect(localStorage.getItem("workspace-settings")).toBeNull();
    });

    it("switches store state when active workspace account changes", () => {
      const sessionA = createSession("a");
      const sessionB = createSession("b");
      const ownerAKey = workspaceRuntimeOwnerKey(sessionA);
      const ownerBKey = workspaceRuntimeOwnerKey(sessionB);
      localStorage.setItem(
        `workspace-settings:${ownerAKey}`,
        JSON.stringify({ notificationSound: "none", language: "ru" }),
      );
      localStorage.setItem(
        `workspace-settings:${ownerBKey}`,
        JSON.stringify({ notificationSound: "subtle", language: "en" }),
      );

      setWorkspaceSessionScope("account-a");
      expect(useSettingsStore.getState().notificationSound).toBe("none");

      useWorkspaceAuthStore.getState().setCurrentAccountId("account-b");
      expect(useSettingsStore.getState().notificationSound).toBe("subtle");
    });

    it("remembers notification sound and unread-priority flags per workspace owner", () => {
      setWorkspaceSessionScope("account-a");

      useSettingsStore.getState().setNotificationSound("glass");
      useSettingsStore.getState().setPrioritizePersonalUnread(true);
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(false);

      useWorkspaceAuthStore.getState().setCurrentAccountId("account-b");
      useSettingsStore.getState().setNotificationSound("none");
      useSettingsStore.getState().setPrioritizePersonalUnread(false);
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(false);

      expect(useSettingsStore.getState().notificationSound).toBe("none");
      expect(useSettingsStore.getState().prioritizePersonalUnread).toBe(false);
      expect(useSettingsStore.getState().prioritizeUnmutedUnreadChannels).toBe(false);

      useWorkspaceAuthStore.getState().setCurrentAccountId("account-a");
      expect(useSettingsStore.getState().notificationSound).toBe("glass");
      expect(useSettingsStore.getState().prioritizePersonalUnread).toBe(true);
      expect(useSettingsStore.getState().prioritizeUnmutedUnreadChannels).toBe(false);
    });

    it("reads legacy instance-scoped settings without writing back to legacy keys", () => {
      const sessionA = createSession("a");
      localStorage.setItem(
        "workspace-settings:instance-a",
        JSON.stringify({ notificationSound: "pulse", language: "ru" }),
      );

      setWorkspaceSessionScope("account-a");
      expect(useSettingsStore.getState().notificationSound).toBe("pulse");

      useSettingsStore.getState().setNotificationSound("glass");

      const ownerKey = workspaceRuntimeOwnerKey(sessionA);
      const raw = localStorage.getItem(`workspace-settings:${ownerKey}`);
      expect(JSON.parse(raw!).notificationSound).toBe("glass");
      expect(
        JSON.parse(localStorage.getItem("workspace-settings:instance-a")!).notificationSound,
      ).toBe("pulse");
    });

    it("does not override scoped i18n locale from settings language on account switch", () => {
      configureWorkspaceI18nStorageScope();
      const sessionA = createSession("a");
      const ownerKey = workspaceRuntimeOwnerKey(sessionA);
      localStorage.setItem(`workspace-locale:${ownerKey}`, "ru");
      localStorage.setItem(
        `workspace-settings:${ownerKey}`,
        JSON.stringify({ language: "en", notificationSound: "none" }),
      );

      setWorkspaceSessionScope("account-a");

      expect(useSettingsStore.getState().language).toBe("en");
      expect(getLocale()).toBe("ru");
    });

    it("keeps scoped i18n locale when owner settings are absent", () => {
      configureWorkspaceI18nStorageScope();
      const sessionA = createSession("a");
      const ownerKey = workspaceRuntimeOwnerKey(sessionA);
      localStorage.setItem(`workspace-locale:${ownerKey}`, "ru");

      setWorkspaceSessionScope("account-a");

      expect(useSettingsStore.getState().language).toBe("en");
      expect(getLocale()).toBe("ru");
    });
  });
});

// loadSettings — module reload tests to verify localStorage parsing
describe("loadSettings (module reload)", () => {
  afterEach(() => {
    resetWorkspaceSessionScope();
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
    vi.resetModules();
  });

  it("uses defaults when localStorage has corrupt JSON", async () => {
    localStorage.setItem("workspace-settings", "not valid json {{{");
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    const state = freshStore.getState();
    expect(state.prioritizePersonalUnread).toBe(false);
    expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
    expect(state.notificationSound).toBe("default");
    expect(state.language).toBe("en");
    expect(state.folderRailLayout).toBe("vertical");
    expect(state.showSystemFolders).toBe(true);
    expect(state.chatListDensity).toBe("standard");
    expect(state.authIdleTimeout).toBe("3d");
  });

  it("uses defaults when localStorage key is absent", async () => {
    localStorage.removeItem("workspace-settings");
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    const state = freshStore.getState();
    expect(state.prioritizePersonalUnread).toBe(false);
    expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
    expect(state.notificationSound).toBe("default");
    expect(state.language).toBe("en");
    expect(state.folderRailLayout).toBe("vertical");
    expect(state.showSystemFolders).toBe(true);
    expect(state.chatListDensity).toBe("standard");
    expect(state.authIdleTimeout).toBe("3d");
  });

  it("loads all saved settings on module init", async () => {
    localStorage.setItem(
      "workspace-settings",
      JSON.stringify({
        prioritizePersonalUnread: true,
        prioritizeUnmutedUnreadChannels: false,
        messengerSidebarSortMode: "unread_first",
        notificationSound: "none",
        language: "ru",
        folderRailLayout: "horizontal",
        showSystemFolders: true,
        chatListDensity: "compact",
        authIdleTimeout: "never",
      }),
    );
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    const state = freshStore.getState();
    expect(state.prioritizePersonalUnread).toBe(true);
    expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
    expect(state.messengerSidebarSortMode).toBe("unread_first");
    expect(state.notificationSound).toBe("none");
    expect(state.language).toBe("ru");
    expect(state.folderRailLayout).toBe("horizontal");
    expect(state.showSystemFolders).toBe(true);
    expect(state.chatListDensity).toBe("compact");
    expect(state.authIdleTimeout).toBe("never");
  });

  it("uses default auth idle timeout when persisted field is missing", async () => {
    localStorage.setItem("workspace-settings", JSON.stringify({ notificationSound: "none" }));
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    expect(freshStore.getState().authIdleTimeout).toBe("3d");
  });

  it("uses default auth idle timeout when persisted field is invalid", async () => {
    localStorage.setItem("workspace-settings", JSON.stringify({ authIdleTimeout: "1y" }));
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    expect(freshStore.getState().authIdleTimeout).toBe("3d");
  });

  it("uses the default sidebar sort mode when the persisted value is invalid", async () => {
    localStorage.setItem(
      "workspace-settings",
      JSON.stringify({ messengerSidebarSortMode: "alphabetical" }),
    );
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    expect(freshStore.getState().messengerSidebarSortMode).toBe("last_message");
  });

  it("respects explicit showSystemFolders false in persisted settings", async () => {
    localStorage.setItem(
      "workspace-settings",
      JSON.stringify({ showSystemFolders: false, language: "en" }),
    );
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    expect(freshStore.getState().showSystemFolders).toBe(false);
  });

  it("derives default language from browser locale when settings are absent", async () => {
    const languageDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "language");
    const originalLanguage = window.navigator.language;
    try {
      Object.defineProperty(window.navigator, "language", {
        value: "ru-RU",
        configurable: true,
      });

      localStorage.removeItem("workspace-settings");
      vi.resetModules();
      const { useSettingsStore: freshStore } = await import("./settings.model");
      const state = freshStore.getState();

      expect(state.language).toBe("ru");
    } finally {
      if (languageDescriptor) {
        Object.defineProperty(window.navigator, "language", languageDescriptor);
      } else {
        Object.defineProperty(window.navigator, "language", {
          value: originalLanguage,
          configurable: true,
        });
      }
    }
  });
});
