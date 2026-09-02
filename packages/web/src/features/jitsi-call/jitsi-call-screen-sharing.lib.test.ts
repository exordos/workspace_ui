import { afterEach, describe, expect, it, vi } from "vitest";
import { setupJitsiScreenSharing } from "./jitsi-call-screen-sharing.lib";

const { setupScreenSharingRender } = vi.hoisted(() => ({
  setupScreenSharingRender: vi.fn(),
}));

vi.mock("@jitsi/electron-sdk/renderer", () => ({
  setupScreenSharingRender,
}));

function createApi(): {
  getNumberOfParticipants: () => number;
  getParticipantsInfo: () => object[];
  on: (event: string, callback: () => void) => void;
} {
  return {
    getNumberOfParticipants: () => 1,
    getParticipantsInfo: () => [],
    on: () => {},
  };
}

afterEach(() => {
  setupScreenSharingRender.mockReset();
  delete (window as unknown as Record<string, unknown>).electronAPI;
});

describe("setupJitsiScreenSharing", () => {
  it("does not initialize the Electron SDK in a browser", () => {
    setupJitsiScreenSharing(createApi());

    expect(setupScreenSharingRender).not.toHaveBeenCalled();
  });

  it("initializes once for the same live Jitsi API", () => {
    (window as unknown as Record<string, unknown>).electronAPI = {};
    const api = createApi();

    setupJitsiScreenSharing(api);
    setupJitsiScreenSharing(api);

    expect(setupScreenSharingRender).toHaveBeenCalledTimes(1);
    expect(setupScreenSharingRender).toHaveBeenCalledWith(api);
  });

  it("initializes a new meeting API independently", () => {
    (window as unknown as Record<string, unknown>).electronAPI = {};
    const firstApi = createApi();
    const secondApi = createApi();

    setupJitsiScreenSharing(firstApi);
    setupJitsiScreenSharing(secondApi);

    expect(setupScreenSharingRender).toHaveBeenCalledTimes(2);
    expect(setupScreenSharingRender).toHaveBeenNthCalledWith(1, firstApi);
    expect(setupScreenSharingRender).toHaveBeenNthCalledWith(2, secondApi);
  });
});
