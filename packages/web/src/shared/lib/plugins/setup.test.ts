/**
 * Tests for plugin system bootstrap.
 *
 * Verifies that initPlugins activates all registered plugins, exposes
 * window.__plugins__ for dev tools, and that loadPlugin registers and
 * activates a plugin immediately.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPlugin, activateAll, getPlugins, activatePlugin } from "./registry";
import { initPlugins, loadPlugin } from "./setup";
import type { Plugin } from "./types";

vi.mock("./registry", () => {
  const plugins: { id: string; name: string; version: string; status: string }[] = [];
  return {
    registerPlugin: vi.fn((p: { manifest: { id: string; name: string; version: string } }) => {
      plugins.push({
        id: p.manifest.id,
        name: p.manifest.name,
        version: p.manifest.version,
        status: "registered",
      });
    }),
    activateAll: vi.fn(async () => {}),
    getPlugins: vi.fn(() => plugins),
    activatePlugin: vi.fn(async () => {}),
    deactivatePlugin: vi.fn(async () => {}),
  };
});

describe("initPlugins", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__plugins__;
  });

  it("calls activateAll during init", async () => {
    await initPlugins();
    expect(activateAll).toHaveBeenCalledOnce();
  });

  it("exposes window.__plugins__ with registry methods", async () => {
    await initPlugins();
    const plugins = (window as unknown as Record<string, unknown>).__plugins__ as Record<
      string,
      unknown
    >;
    expect(plugins).toBeDefined();
    expect(typeof plugins.list).toBe("function");
    expect(typeof plugins.register).toBe("function");
    expect(typeof plugins.activate).toBe("function");
    expect(typeof plugins.deactivate).toBe("function");
  });

  it("window.__plugins__.list returns getPlugins result", async () => {
    await initPlugins();
    const plugins = (window as unknown as Record<string, unknown>).__plugins__ as {
      list: typeof getPlugins;
    };
    plugins.list();
    expect(getPlugins).toHaveBeenCalled();
  });
});

describe("loadPlugin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers and activates the plugin", () => {
    const testPlugin: Plugin = {
      manifest: { id: "com.test.sample", name: "Sample", version: "1.0.0" },
      activate: vi.fn(),
    };

    loadPlugin(testPlugin);

    expect(registerPlugin).toHaveBeenCalledWith(testPlugin);
    expect(activatePlugin).toHaveBeenCalledWith("com.test.sample");
  });

  it("handles activation failure gracefully", () => {
    vi.mocked(activatePlugin).mockRejectedValueOnce(new Error("activation failed"));

    const testPlugin: Plugin = {
      manifest: { id: "com.test.failing", name: "Failing", version: "0.1.0" },
      activate: vi.fn(),
    };

    expect(() => loadPlugin(testPlugin)).not.toThrow();
    expect(registerPlugin).toHaveBeenCalledWith(testPlugin);
  });
});
