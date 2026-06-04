import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useJitsiExternalApiLoader } from "./jitsi-call-api-loader.hook";

vi.mock("~/shared/lib/jitsi-external-api.loader", () => ({
  ensureJitsiExternalApiLoaded: vi.fn(),
}));

import { ensureJitsiExternalApiLoaded } from "~/shared/lib/jitsi-external-api.loader";

describe("useJitsiExternalApiLoader", () => {
  afterEach(() => {
    vi.mocked(ensureJitsiExternalApiLoaded).mockReset();
  });

  it("stays idle when disabled", () => {
    const { result } = renderHook(() => useJitsiExternalApiLoader(false));
    expect(result.current.loadState).toBe("idle");
    expect(ensureJitsiExternalApiLoaded).not.toHaveBeenCalled();
  });

  it("loads API when enabled and reports ready", async () => {
    vi.mocked(ensureJitsiExternalApiLoaded).mockResolvedValue(undefined);
    const { result } = renderHook(() => useJitsiExternalApiLoader(true));

    await waitFor(() => {
      expect(result.current.loadState).toBe("ready");
    });
  });

  it("reports error and retries load", async () => {
    vi.mocked(ensureJitsiExternalApiLoaded)
      .mockRejectedValueOnce(new Error("cdn down"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useJitsiExternalApiLoader(true));

    await waitFor(() => {
      expect(result.current.loadState).toBe("error");
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.loadState).toBe("ready");
    });
    expect(ensureJitsiExternalApiLoaded).toHaveBeenCalledTimes(2);
  });
});
