/**
 * Tests for the plugin system registry, API, and permission gating.
 *
 * Verifies the full plugin lifecycle: register → activate → contribute →
 * deactivate → unregister. Tests cover slot-based UI contributions, scoped
 * storage, event pub/sub, permission-gated capabilities (navigate, analytics,
 * notifications, read:streams, read:messages), and error isolation. This is
 * the extensibility layer that allows third-party code to enhance the app
 * safely within a sandboxed API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { setPluginNavigate } from "~/shared/lib/plugins/api";
import {
  registerPlugin,
  unregisterPlugin,
  activatePlugin,
  deactivatePlugin,
  activateAll,
  getPlugins,
  getPluginStatus,
  isPluginActive,
  getContributions,
  emitEvent,
  subscribe,
} from "~/shared/lib/plugins/registry";
import type { Plugin, PluginAPI, PluginPermission } from "~/shared/lib/plugins/types";

function createTestPlugin(
  id: string,
  overrides?: Partial<Plugin> & { permissions?: PluginPermission[] },
): Plugin {
  return {
    manifest: {
      id,
      name: `Test Plugin ${id}`,
      version: "1.0.0",
      permissions: overrides?.permissions ?? ["storage", "navigate"],
      slots: ["sidebar:widget"],
      ...overrides?.manifest,
    },
    activate: overrides?.activate ?? vi.fn(),
    deactivate: overrides?.deactivate ?? vi.fn(),
    ...overrides,
  };
}

// Verifies the core plugin lifecycle: register, activate, deactivate, unregister
describe("Plugin Registry", () => {
  afterEach(() => {
    for (const p of getPlugins()) {
      unregisterPlugin(p.id);
    }
  });

  // Registration adds the plugin to the list in "registered" state
  it("registers a plugin", () => {
    const plugin = createTestPlugin("test.register");
    registerPlugin(plugin);

    const list = getPlugins();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("test.register");
    expect(list[0]!.status).toBe("registered");
  });

  // Duplicate registration is silently ignored to prevent conflicts
  it("does not register duplicate", () => {
    const plugin = createTestPlugin("test.dup");
    registerPlugin(plugin);
    registerPlugin(plugin);

    expect(getPlugins()).toHaveLength(1);
  });

  // Activation calls the plugin's activate() hook and changes status to "active"
  it("activates a plugin", async () => {
    const activate = vi.fn();
    const plugin = createTestPlugin("test.activate", { activate });
    registerPlugin(plugin);

    await activatePlugin("test.activate");

    expect(activate).toHaveBeenCalledOnce();
    expect(getPluginStatus("test.activate")).toBe("active");
    expect(isPluginActive("test.activate")).toBe(true);
  });

  // Deactivation calls deactivate() and sets status to "inactive"
  it("deactivates a plugin", async () => {
    const deactivate = vi.fn();
    const plugin = createTestPlugin("test.deact", { deactivate });
    registerPlugin(plugin);
    await activatePlugin("test.deact");

    await deactivatePlugin("test.deact");

    expect(deactivate).toHaveBeenCalledOnce();
    expect(getPluginStatus("test.deact")).toBe("inactive");
    expect(isPluginActive("test.deact")).toBe(false);
  });

  // Unregistration fully removes the plugin (deactivates first if needed)
  it("unregisters a plugin", async () => {
    const plugin = createTestPlugin("test.unreg");
    registerPlugin(plugin);
    await activatePlugin("test.unreg");

    unregisterPlugin("test.unreg");

    expect(getPlugins()).toHaveLength(0);
    expect(getPluginStatus("test.unreg")).toBeNull();
  });

  // A broken plugin must not crash the app — error is captured in status
  it("handles activation error gracefully", async () => {
    const plugin = createTestPlugin("test.error", {
      activate: () => {
        throw new Error("boom");
      },
    });
    registerPlugin(plugin);

    await activatePlugin("test.error");

    expect(getPluginStatus("test.error")).toBe("error");
  });

  // Plugins can inject UI into named slots (e.g. "sidebar:widget")
  it("collects slot contributions", async () => {
    const plugin = createTestPlugin("test.contrib", {
      activate(api: PluginAPI) {
        api.contribute({
          slot: "sidebar:widget",
          label: "My Widget",
          priority: 10,
          render: () => null,
        });
      },
    });
    registerPlugin(plugin);
    await activatePlugin("test.contrib");

    const contribs = getContributions("sidebar:widget");
    expect(contribs).toHaveLength(1);
    expect(contribs[0]!.label).toBe("My Widget");
    expect(contribs[0]!.pluginId).toBe("test.contrib");
  });

  // Deactivated plugins must not leave orphaned UI contributions
  it("clears contributions on deactivation", async () => {
    const plugin = createTestPlugin("test.clear", {
      activate(api: PluginAPI) {
        api.contribute({
          slot: "sidebar:widget",
          label: "Widget",
          render: () => null,
        });
      },
    });
    registerPlugin(plugin);
    await activatePlugin("test.clear");

    expect(getContributions("sidebar:widget")).toHaveLength(1);

    await deactivatePlugin("test.clear");

    expect(getContributions("sidebar:widget")).toHaveLength(0);
  });

  // Priority determines rendering order — lower priority renders first
  it("sorts contributions by priority", async () => {
    const p1 = createTestPlugin("test.p1", {
      activate(api: PluginAPI) {
        api.contribute({ slot: "topbar:action", label: "B", priority: 200, render: () => null });
      },
    });
    const p2 = createTestPlugin("test.p2", {
      activate(api: PluginAPI) {
        api.contribute({ slot: "topbar:action", label: "A", priority: 10, render: () => null });
      },
    });

    registerPlugin(p1);
    registerPlugin(p2);
    await activatePlugin("test.p1");
    await activatePlugin("test.p2");

    const contribs = getContributions("topbar:action");
    expect(contribs[0]!.label).toBe("A");
    expect(contribs[1]!.label).toBe("B");
  });
});

// Verifies the sandboxed API that plugins receive in their activate() hook
describe("Plugin API", () => {
  afterEach(() => {
    for (const p of getPlugins()) {
      unregisterPlugin(p.id);
    }
  });

  // Each plugin gets isolated localStorage scoped by plugin ID
  it("provides scoped storage", async () => {
    let savedApi: PluginAPI | null = null;
    const plugin = createTestPlugin("test.storage", {
      manifest: {
        id: "test.storage",
        name: "Storage Test",
        version: "1.0.0",
        permissions: ["storage"],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    registerPlugin(plugin);
    await activatePlugin("test.storage");

    savedApi!.storage.set("key1", { value: 42 });
    expect(savedApi!.storage.get("key1")).toEqual({ value: 42 });

    savedApi!.storage.remove("key1");
    expect(savedApi!.storage.get("key1")).toBeNull();
  });

  it("provides scoped logger", async () => {
    let savedApi: PluginAPI | null = null;
    const plugin = createTestPlugin("test.logger", {
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    registerPlugin(plugin);
    await activatePlugin("test.logger");

    expect(() => savedApi!.log.info("test message")).not.toThrow();
    expect(() => savedApi!.log.warn("warning")).not.toThrow();
    expect(() => savedApi!.log.error("error")).not.toThrow();
  });

  // Plugins can read app state (theme, locale, runtime) but not write it
  it("provides read-only data", async () => {
    let savedApi: PluginAPI | null = null;
    const plugin = createTestPlugin("test.data", {
      manifest: {
        id: "test.data",
        name: "Data Test",
        version: "1.0.0",
        permissions: ["read:streams", "read:messages"],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    registerPlugin(plugin);
    await activatePlugin("test.data");

    expect(typeof savedApi!.data.getTheme()).toBe("string");
    expect(typeof savedApi!.data.getLocale()).toBe("string");
    expect(typeof savedApi!.data.getRuntime()).toBe("string");
    expect(savedApi!.data.getCurrentUserId()).toBeNull();
  });

  // Plugins can subscribe to app events (theme changes, navigation, etc.)
  it("provides event subscription", async () => {
    const handler = vi.fn();
    const plugin = createTestPlugin("test.events", {
      activate(api: PluginAPI) {
        api.on("theme:changed", handler);
      },
    });
    registerPlugin(plugin);
    await activatePlugin("test.events");

    emitEvent("theme:changed", { mode: "dark" });

    expect(handler).toHaveBeenCalledWith({ mode: "dark" });
  });
});

// ---------------------------------------------------------------------------
// activateAll
// ---------------------------------------------------------------------------

// Verifies batch activation of all registered plugins at once
describe("activateAll", () => {
  afterEach(() => {
    for (const p of getPlugins()) {
      unregisterPlugin(p.id);
    }
  });

  // All registered-but-inactive plugins should be activated
  it("activates all registered plugins", async () => {
    const a1 = vi.fn();
    const a2 = vi.fn();
    registerPlugin(createTestPlugin("test.all.1", { activate: a1 }));
    registerPlugin(createTestPlugin("test.all.2", { activate: a2 }));

    await activateAll();

    expect(a1).toHaveBeenCalledOnce();
    expect(a2).toHaveBeenCalledOnce();
    expect(isPluginActive("test.all.1")).toBe(true);
    expect(isPluginActive("test.all.2")).toBe(true);
  });

  // Already active plugins should not be activated again (idempotent)
  it("skips already active plugins", async () => {
    const activate = vi.fn();
    registerPlugin(createTestPlugin("test.all.skip", { activate }));
    await activatePlugin("test.all.skip");
    activate.mockClear();

    await activateAll();

    expect(activate).not.toHaveBeenCalled();
  });

  // Previously deactivated plugins can be re-activated via activateAll
  it("re-activates inactive (deactivated) plugins", async () => {
    const activate = vi.fn();
    registerPlugin(createTestPlugin("test.all.reactivate", { activate }));
    await activatePlugin("test.all.reactivate");
    await deactivatePlugin("test.all.reactivate");
    activate.mockClear();

    await activateAll();

    expect(activate).toHaveBeenCalledOnce();
    expect(isPluginActive("test.all.reactivate")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// emitEvent edge cases
// ---------------------------------------------------------------------------

// Verifies event emission and error isolation between plugin handlers
describe("emitEvent", () => {
  afterEach(() => {
    for (const p of getPlugins()) {
      unregisterPlugin(p.id);
    }
  });

  // Emitting to zero subscribers should be a safe no-op
  it("does not throw when no handlers are registered for an event", () => {
    expect(() => emitEvent("network:status", { online: true })).not.toThrow();
  });

  // One broken handler must not prevent other handlers from receiving events
  it("catches and logs handler errors without propagating", async () => {
    const good = vi.fn();
    registerPlugin(
      createTestPlugin("test.emit.err", {
        activate(api: PluginAPI) {
          api.on("message:received", () => {
            throw new Error("handler boom");
          });
          api.on("message:received", good);
        },
      }),
    );
    await activatePlugin("test.emit.err");

    expect(() => emitEvent("message:received", { id: 1 })).not.toThrow();
    expect(good).toHaveBeenCalledWith({ id: 1 });
  });

  // Events are topic-based — only subscribers for that event type receive it
  it("delivers events only to subscribed plugins", async () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    registerPlugin(
      createTestPlugin("test.emit.a", {
        activate(api: PluginAPI) {
          api.on("theme:changed", h1);
        },
      }),
    );
    registerPlugin(
      createTestPlugin("test.emit.b", {
        activate(api: PluginAPI) {
          api.on("navigation:changed", h2);
        },
      }),
    );
    await activatePlugin("test.emit.a");
    await activatePlugin("test.emit.b");

    emitEvent("theme:changed", "dark");

    expect(h1).toHaveBeenCalledWith("dark");
    expect(h2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// subscribe (registry change listener)
// ---------------------------------------------------------------------------

// Verifies registry change notifications for UI that lists installed plugins
describe("subscribe", () => {
  afterEach(() => {
    for (const p of getPlugins()) {
      unregisterPlugin(p.id);
    }
  });

  // Plugin list UI should update when a new plugin is registered
  it("notifies on register", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);

    registerPlugin(createTestPlugin("test.sub.reg"));
    expect(cb).toHaveBeenCalled();

    unsub();
  });

  it("notifies on activate", async () => {
    registerPlugin(createTestPlugin("test.sub.act"));
    const cb = vi.fn();
    const unsub = subscribe(cb);

    await activatePlugin("test.sub.act");
    expect(cb).toHaveBeenCalled();

    unsub();
  });

  it("stops notifying after unsubscribe", () => {
    const cb = vi.fn();
    const unsub = subscribe(cb);
    unsub();

    registerPlugin(createTestPlugin("test.sub.unsub"));
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// activatePlugin for unknown plugin
// ---------------------------------------------------------------------------

// Verifies edge cases: unknown IDs, no-op operations, safe cleanup
describe("activatePlugin edge cases", () => {
  // Activating a non-existent plugin should not crash
  it("returns early for unknown plugin id", async () => {
    await expect(activatePlugin("non.existent.plugin")).resolves.toBeUndefined();
    expect(getPluginStatus("non.existent.plugin")).toBeNull();
  });

  it("deactivatePlugin no-ops for non-active plugin", async () => {
    registerPlugin(createTestPlugin("test.deact.noop"));
    await expect(deactivatePlugin("test.deact.noop")).resolves.toBeUndefined();
    expect(getPluginStatus("test.deact.noop")).toBe("registered");
    unregisterPlugin("test.deact.noop");
  });

  it("unregisterPlugin no-ops for unknown id", () => {
    expect(() => unregisterPlugin("does.not.exist")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Plugin API — permission-gated methods
// ---------------------------------------------------------------------------

// Verifies that each API capability is gated by the plugin's declared permissions
describe("Plugin API permission gating", () => {
  afterEach(() => {
    for (const p of getPlugins()) {
      unregisterPlugin(p.id);
    }
  });

  // Plugins without 'navigate' permission must not be able to change routes
  it("navigate is blocked without 'navigate' permission", async () => {
    const navigateSpy = vi.fn();
    setPluginNavigate(navigateSpy);

    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-nav",
        name: "No Navigate",
        version: "1.0.0",
        permissions: ["storage"],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-nav");

    savedApi!.navigate("/blocked");
    expect(navigateSpy).not.toHaveBeenCalled();

    setPluginNavigate(null!);
  });

  // Plugins that declare 'navigate' permission can change routes
  it("navigate works with 'navigate' permission", async () => {
    const navigateSpy = vi.fn();
    setPluginNavigate(navigateSpy);

    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.has-nav",
        name: "Has Navigate",
        version: "1.0.0",
        permissions: ["navigate"],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.has-nav");

    savedApi!.navigate("/allowed");
    expect(navigateSpy).toHaveBeenCalledWith("/allowed");

    setPluginNavigate(null!);
  });

  // Without 'storage' permission, reads return null (sandbox isolation)
  it("storage.get returns null without 'storage' permission", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-storage",
        name: "No Storage",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-storage");

    savedApi!.storage.set("key", "value");
    expect(savedApi!.storage.get("key")).toBeNull();
  });

  // Without 'storage' permission, writes are silently dropped
  it("storage.set is no-op without 'storage' permission", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-storage-set",
        name: "No Storage Set",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-storage-set");

    savedApi!.storage.set("key", "value");
    expect(localStorage.getItem("plugin:test.perm.no-storage-set:key")).toBeNull();
  });

  it("storage.remove is no-op without 'storage' permission", async () => {
    localStorage.setItem("plugin:test.perm.no-storage-rm:k", '"v"');
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-storage-rm",
        name: "No Storage Rm",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-storage-rm");

    savedApi!.storage.remove("k");
    expect(localStorage.getItem("plugin:test.perm.no-storage-rm:k")).toBe('"v"');
  });

  // Analytics tracking requires explicit 'analytics' permission
  it("track is not available without 'analytics' permission", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-analytics",
        name: "No Analytics",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-analytics");

    expect(savedApi!.track).toBeUndefined();
  });

  // Plugins with 'analytics' permission can send events
  it("track is available with 'analytics' permission", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.has-analytics",
        name: "Has Analytics",
        version: "1.0.0",
        permissions: ["analytics"],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.has-analytics");

    expect(typeof savedApi!.track).toBe("function");
    expect(() => savedApi!.track!("test_event", { x: 1 })).not.toThrow();
  });

  // Notification access requires explicit permission to prevent spam
  it("notify is not available without 'notifications' permission", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-notif",
        name: "No Notifications",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-notif");

    expect(savedApi!.notify).toBeUndefined();
  });

  it("notify is available with 'notifications' permission", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.has-notif",
        name: "Has Notifications",
        version: "1.0.0",
        permissions: ["notifications"],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.has-notif");

    expect(typeof savedApi!.notify).toBe("function");
  });

  // Stream list is protected — requires explicit read:streams permission
  it("data.getStreams returns empty without 'read:streams'", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-streams",
        name: "No Streams",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-streams");

    expect(savedApi!.data.getStreams()).toEqual([]);
  });

  // Unread count is message data — requires read:messages permission
  it("data.getUnreadCount returns 0 without 'read:messages'", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.no-messages",
        name: "No Messages",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
      },
    });
    await activatePlugin("test.perm.no-messages");

    expect(savedApi!.data.getUnreadCount()).toBe(0);
  });

  // Unsubscribe must stop event delivery to prevent leaked handlers
  it("event unsubscribe stops delivery", async () => {
    const handler = vi.fn();
    let unsub: (() => void) | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.unsub-event",
        name: "Unsub Event",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        unsub = api.on("theme:changed", handler);
      },
    });
    await activatePlugin("test.perm.unsub-event");

    emitEvent("theme:changed", "light");
    expect(handler).toHaveBeenCalledTimes(1);

    unsub!();
    emitEvent("theme:changed", "dark");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // Plugins can manually clear all their UI contributions at once
  it("removeContributions clears all contributions for the plugin", async () => {
    let savedApi: PluginAPI | null = null;
    registerPlugin({
      manifest: {
        id: "test.perm.rm-contrib",
        name: "Rm Contrib",
        version: "1.0.0",
        permissions: [],
      },
      activate(api: PluginAPI) {
        savedApi = api;
        api.contribute({ slot: "sidebar:widget", label: "W1", render: () => null });
        api.contribute({ slot: "sidebar:widget", label: "W2", render: () => null });
      },
    });
    await activatePlugin("test.perm.rm-contrib");

    expect(
      getContributions("sidebar:widget").filter((c) => c.pluginId === "test.perm.rm-contrib"),
    ).toHaveLength(2);

    savedApi!.removeContributions();
    expect(
      getContributions("sidebar:widget").filter((c) => c.pluginId === "test.perm.rm-contrib"),
    ).toHaveLength(0);
  });
});
