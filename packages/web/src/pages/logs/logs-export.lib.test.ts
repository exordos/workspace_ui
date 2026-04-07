import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogEntry } from "~/shared/lib/logger";
import {
  buildLogsExportFilename,
  downloadLogsAsFile,
  serializeLogsForExport,
} from "./logs-export.lib";

const SAMPLE_ENTRY: LogEntry = {
  level: "info",
  scope: "logs-test",
  message: "Entry",
  timestamp: "2026-03-14T10:00:00.000Z",
  runtime: "web",
  data: { attempt: 1 },
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe("logs-export.lib", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("builds timestamped export filename", () => {
    const filename = buildLogsExportFilename(new Date("2026-03-14T08:09:10.000Z"));
    expect(filename).toBe("workspace-logs-20260314-080910.json");
  });

  it("serializes entries as formatted json", () => {
    const json = serializeLogsForExport([SAMPLE_ENTRY]);
    expect(json).toContain('"scope": "logs-test"');
    expect(json).toContain('"message": "Entry"');
  });

  it("redacts sensitive payload keys before export serialization", () => {
    const sensitiveKey = ["api", "Key"].join("");
    const sensitiveValue = "fixture-redaction-input";
    const json = serializeLogsForExport([
      {
        ...SAMPLE_ENTRY,
        data: {
          [sensitiveKey]: sensitiveValue,
          safeField: "ok",
        },
      },
    ]);

    expect(json).toContain(`"${sensitiveKey}": "[REDACTED]"`);
    expect(json).toContain('"safeField": "ok"');
    expect(json).not.toContain(sensitiveValue);
  });

  it("does nothing when there is nothing to export", () => {
    const createObjectURLMock = vi.fn(() => "blob:test");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });

    downloadLogsAsFile([]);
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it("creates downloadable file and revokes object URL", () => {
    const createObjectURLMock = vi.fn(() => "blob:test");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadLogsAsFile([SAMPLE_ENTRY]);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:test");
  });
});
