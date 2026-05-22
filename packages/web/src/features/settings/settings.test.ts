/**
 * Tests for the settings feature — localStorage persistence,
 * individual setting updates, and reset to defaults.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useSettingsStore } from "./settings.model";

function resetInstanceScope(): void {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    unreadCountsByInstance: {},
  });
}

function setInstanceScope(instanceIds: string[], currentInstanceId: string): void {
  useInstancesStore.setState({
    instances: instanceIds.map((id) => ({
      id,
      realm: `https://${id}.example.com`,
      email: `${id}@example.com`,
      apiKey: `key-${id}`,
    })),
    currentInstanceId,
    unreadCountsByInstance: {},
  });
}

describe("useSettingsStore", () => {
  afterEach(() => {
    useSettingsStore.getState().resetToDefaults();
    resetInstanceScope();
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
  });

  describe("initial state", () => {
    it("starts with default settings", () => {
      const state = useSettingsStore.getState();
      expect(state.chatSorting).toBe("recent");
      expect(state.prioritizePersonalUnread).toBe(false);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
      expect(state.notificationSound).toBe("default");
      expect(state.language).toBe("en");
      expect(state.folderRailLayout).toBe("vertical");
      expect(state.showSystemFolders).toBe(true);
      expect(state.chatListDensity).toBe("standard");
      expect(state.authIdleTimeout).toBe("3d");
    });
  });

  describe("setChatSorting", () => {
    it("updates chat sorting to unread", () => {
      useSettingsStore.getState().setChatSorting("unread");
      const state = useSettingsStore.getState();
      expect(state.chatSorting).toBe("unread");
      expect(state.prioritizePersonalUnread).toBe(true);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(true);
    });

    it("updates chat sorting to alphabetical", () => {
      useSettingsStore.getState().setChatSorting("alphabetical");
      const state = useSettingsStore.getState();
      expect(state.chatSorting).toBe("alphabetical");
      expect(state.prioritizePersonalUnread).toBe(false);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
    });

    it("persists to localStorage", () => {
      useSettingsStore.getState().setChatSorting("unread");
      const raw = localStorage.getItem("workspace-settings");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.chatSorting).toBe("unread");
      expect(parsed.prioritizePersonalUnread).toBe(true);
      expect(parsed.prioritizeUnmutedUnreadChannels).toBe(true);
    });
  });

  describe("unread-priority flags", () => {
    it("toggles prioritizePersonalUnread and derives legacy sorting", () => {
      useSettingsStore.getState().setPrioritizePersonalUnread(true);

      let state = useSettingsStore.getState();
      expect(state.prioritizePersonalUnread).toBe(true);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
      expect(state.chatSorting).toBe("unread");

      useSettingsStore.getState().setPrioritizePersonalUnread(false);
      state = useSettingsStore.getState();
      expect(state.prioritizePersonalUnread).toBe(false);
      expect(state.chatSorting).toBe("recent");
    });

    it("toggles prioritizeUnmutedUnreadChannels and persists", () => {
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(true);

      const state = useSettingsStore.getState();
      expect(state.prioritizeUnmutedUnreadChannels).toBe(true);
      expect(state.chatSorting).toBe("unread");

      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.prioritizeUnmutedUnreadChannels).toBe(true);
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
      useSettingsStore.getState().setChatSorting("alphabetical");
      useSettingsStore.getState().setPrioritizePersonalUnread(true);
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(true);
      useSettingsStore.getState().setNotificationSound("none");
      useSettingsStore.getState().setLanguage("ru");
      useSettingsStore.getState().setShowSystemFolders(true);
      useSettingsStore.getState().setChatListDensity("compact");
      useSettingsStore.getState().setAuthIdleTimeout("never");

      useSettingsStore.getState().resetToDefaults();

      const state = useSettingsStore.getState();
      expect(state.chatSorting).toBe("recent");
      expect(state.prioritizePersonalUnread).toBe(false);
      expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
      expect(state.notificationSound).toBe("default");
      expect(state.language).toBe("en");
      expect(state.showSystemFolders).toBe(true);
      expect(state.chatListDensity).toBe("standard");
      expect(state.authIdleTimeout).toBe("3d");
    });

    it("persists defaults to localStorage", () => {
      useSettingsStore.getState().setChatSorting("unread");
      useSettingsStore.getState().resetToDefaults();

      const raw = localStorage.getItem("workspace-settings");
      const parsed = JSON.parse(raw!);
      expect(parsed.chatSorting).toBe("recent");
      expect(parsed.prioritizePersonalUnread).toBe(false);
      expect(parsed.prioritizeUnmutedUnreadChannels).toBe(false);
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
      expect(parsed.chatSorting).toBe("unread");
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

  describe("organization scope", () => {
    it("persists settings under the active organization id", () => {
      setInstanceScope(["org-a"], "org-a");

      useSettingsStore.getState().setNotificationSound("subtle");

      const raw = localStorage.getItem("workspace-settings:org-a");
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.notificationSound).toBe("subtle");
      expect(parsed.authIdleTimeout).toBe("3d");
      expect(localStorage.getItem("workspace-settings")).toBeNull();
    });

    it("switches store state when active organization changes", () => {
      localStorage.setItem(
        "workspace-settings:org-a",
        JSON.stringify({ notificationSound: "none", language: "ru" }),
      );
      localStorage.setItem(
        "workspace-settings:org-b",
        JSON.stringify({ notificationSound: "subtle", language: "en" }),
      );

      setInstanceScope(["org-a", "org-b"], "org-a");
      expect(useSettingsStore.getState().notificationSound).toBe("none");

      useInstancesStore.getState().setCurrentInstanceId("org-b");
      expect(useSettingsStore.getState().notificationSound).toBe("subtle");
    });

    it("remembers notification sound and chat sorting per organization", () => {
      setInstanceScope(["org-a", "org-b"], "org-a");

      useSettingsStore.getState().setNotificationSound("glass");
      useSettingsStore.getState().setPrioritizePersonalUnread(true);
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(false);

      useInstancesStore.getState().setCurrentInstanceId("org-b");
      useSettingsStore.getState().setNotificationSound("none");
      useSettingsStore.getState().setPrioritizePersonalUnread(false);
      useSettingsStore.getState().setPrioritizeUnmutedUnreadChannels(false);

      expect(useSettingsStore.getState().notificationSound).toBe("none");
      expect(useSettingsStore.getState().chatSorting).toBe("recent");

      useInstancesStore.getState().setCurrentInstanceId("org-a");
      expect(useSettingsStore.getState().notificationSound).toBe("glass");
      expect(useSettingsStore.getState().chatSorting).toBe("unread");
      expect(useSettingsStore.getState().prioritizePersonalUnread).toBe(true);
      expect(useSettingsStore.getState().prioritizeUnmutedUnreadChannels).toBe(false);
    });
  });
});

// loadSettings — module reload tests to verify localStorage parsing
describe("loadSettings (module reload)", () => {
  afterEach(() => {
    resetInstanceScope();
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
    vi.resetModules();
  });

  it("uses defaults when localStorage has corrupt JSON", async () => {
    localStorage.setItem("workspace-settings", "not valid json {{{");
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    const state = freshStore.getState();
    expect(state.chatSorting).toBe("recent");
    expect(state.prioritizePersonalUnread).toBe(false);
    expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
    expect(state.notificationSound).toBe("default");
    expect(state.language).toBe("en");
    expect(state.folderRailLayout).toBe("vertical");
    expect(state.showSystemFolders).toBe(true);
    expect(state.chatListDensity).toBe("standard");
    expect(state.authIdleTimeout).toBe("3d");
  });

  it("maps legacy unread mode to both unread-priority flags", async () => {
    localStorage.setItem("workspace-settings", JSON.stringify({ chatSorting: "unread" }));
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    const state = freshStore.getState();
    expect(state.chatSorting).toBe("unread");
    expect(state.prioritizePersonalUnread).toBe(true);
    expect(state.prioritizeUnmutedUnreadChannels).toBe(true);
    expect(state.notificationSound).toBe("default");
    expect(state.language).toBe("en");
    expect(state.folderRailLayout).toBe("horizontal");
    expect(state.showSystemFolders).toBe(true);
    expect(state.chatListDensity).toBe("standard");
    expect(state.authIdleTimeout).toBe("3d");
  });

  it("derives unread chat sorting from persisted unread-priority flags when legacy field is absent", async () => {
    localStorage.setItem(
      "workspace-settings",
      JSON.stringify({
        prioritizePersonalUnread: true,
        prioritizeUnmutedUnreadChannels: false,
      }),
    );
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    const state = freshStore.getState();

    expect(state.chatSorting).toBe("unread");
    expect(state.prioritizePersonalUnread).toBe(true);
    expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
    expect(state.authIdleTimeout).toBe("3d");
  });

  it("uses defaults when localStorage key is absent", async () => {
    localStorage.removeItem("workspace-settings");
    vi.resetModules();
    const { useSettingsStore: freshStore } = await import("./settings.model");
    const state = freshStore.getState();
    expect(state.chatSorting).toBe("recent");
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
        chatSorting: "recent",
        prioritizePersonalUnread: true,
        prioritizeUnmutedUnreadChannels: false,
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
    expect(state.chatSorting).toBe("recent");
    expect(state.prioritizePersonalUnread).toBe(true);
    expect(state.prioritizeUnmutedUnreadChannels).toBe(false);
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
