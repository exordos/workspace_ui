import { describe, expect, it } from "vitest";
import { shouldRenderChatShell } from "./layout-chat-shell.lib";

describe("shouldRenderChatShell", () => {
  it("returns true for chat routes", () => {
    expect(shouldRenderChatShell("/stream/general", "chat")).toBe(true);
    expect(shouldRenderChatShell("/org/acme/dm/42", "chat")).toBe(true);
  });

  it("returns false for diagnostics routes to allow full-page diagnostics", () => {
    expect(shouldRenderChatShell("/settings/logs", "chat")).toBe(false);
    expect(shouldRenderChatShell("/logs", "chat")).toBe(false);
    expect(shouldRenderChatShell("/org/acme/settings/logs", "chat")).toBe(false);
  });

  it("returns false for non-chat sections", () => {
    expect(shouldRenderChatShell("/calendar", "calendar")).toBe(false);
    expect(shouldRenderChatShell("/mail", "mail")).toBe(false);
    expect(shouldRenderChatShell("/calls", "calls")).toBe(false);
    expect(shouldRenderChatShell("/services", "services")).toBe(false);
  });
});
