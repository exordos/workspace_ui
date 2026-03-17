import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogHistory, createLogger, setMinLevel } from "./logger";

describe("logger electron transport", () => {
  const originalElectronAPI = window.electronAPI;

  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  afterEach(() => {
    if (originalElectronAPI) {
      (window as unknown as Record<string, unknown>).electronAPI = originalElectronAPI;
    } else {
      delete (window as unknown as Record<string, unknown>).electronAPI;
    }
  });

  it("forwards entries to electron logs append API when available", () => {
    const append = vi.fn().mockResolvedValue(true);
    (window as unknown as Record<string, unknown>).electronAPI = {
      logs: { append },
    };

    const log = createLogger("electron-logs");
    log.error("persist me", { field: "value" });

    expect(append).toHaveBeenCalledTimes(1);
    const payload = append.mock.calls[0]?.[0];
    expect(typeof payload).toBe("string");
    expect(payload).toContain('"scope":"electron-logs"');
    expect(payload).toContain('"message":"persist me"');
    expect(payload).toContain('"field":"value"');
  });

  it("does not throw when append API rejects", () => {
    const append = vi.fn().mockRejectedValue(new Error("io failed"));
    (window as unknown as Record<string, unknown>).electronAPI = {
      logs: { append },
    };

    const log = createLogger("electron-logs");
    expect(() => log.warn("transport failure should be swallowed")).not.toThrow();
  });
});
