import { describe, expect, it, vi } from "vitest";
import { startMessengerEventLoop, startMessengerEventLoopForCredentials } from "./event-loop";

vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("startMessengerEventLoop", () => {
  it("does not start the old queue transport", () => {
    expect(() => startMessengerEventLoop({ onEvent: vi.fn() })).not.toThrow();
  });

  it("does not start background legacy transport for credentials", () => {
    expect(() =>
      startMessengerEventLoopForCredentials({
        credentials: {
          realm: "https://example.test",
          login: "user@example.test",
          accessToken: "token",
        },
        onEvent: vi.fn(),
      }),
    ).not.toThrow();
  });
});
