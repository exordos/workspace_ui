import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushReconnectStreamPreviewsAfterRegister,
  markReconnectStreamPreviewRegisterReady,
  resetReconnectStreamPreviewStaging,
  stageReconnectStreamPreviews,
} from "./layout-reconnect-stream-preview.lib";

describe("layout-reconnect-stream-preview", () => {
  beforeEach(() => {
    resetReconnectStreamPreviewStaging();
  });

  it("does not flush before register hydration is ready", () => {
    const apply = vi.fn();
    stageReconnectStreamPreviews(
      { mode: "streamPreviews", messages: [], latestMessageIdHint: 1 },
      { currentInstanceId: "i1", setFromMessages: vi.fn() },
    );
    expect(flushReconnectStreamPreviewsAfterRegister(apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("flushes staged previews after register hydration is ready", () => {
    const apply = vi.fn();
    const result = {
      mode: "streamPreviews" as const,
      messages: [],
      latestMessageIdHint: 1,
    };
    const options = { currentInstanceId: "i1", setFromMessages: vi.fn() };
    stageReconnectStreamPreviews(result, options);
    markReconnectStreamPreviewRegisterReady();
    expect(flushReconnectStreamPreviewsAfterRegister(apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith(result, options);
    expect(flushReconnectStreamPreviewsAfterRegister(apply)).toBe(false);
  });
});
