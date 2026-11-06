import { fireEvent, screen } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import { isWebView } from "~/shared/lib/webview";
import { buildWorkspaceMessageDesktopLink } from "~/shared/lib/workspace-message-permalink.lib";
import { renderWithProviders } from "~/test/render";
import { writeMessageOpenPreference } from "./app-message-entry.lib";
import { AppMessageEntry } from "./app-message-entry.ui";

vi.mock("~/shared/lib/webview", () => ({ isWebView: vi.fn(() => false) }));
vi.mock("~/shared/lib/electron", () => ({ getElectronAPI: () => null }));
vi.mock("~/shared/lib/workspace-message-permalink.lib", () => ({
  buildWorkspaceMessageDesktopLink: vi.fn(() => null),
}));
const originalTouchPoints = Object.getOwnPropertyDescriptor(navigator, "maxTouchPoints");
function WebMessage() {
  const navigate = useNavigate();
  return (
    <div>
      web-message
      <button
        onClick={() =>
          void navigate("/org/org/project/project/stream/stream/topic/topic#message-message")
        }
      >
        resolve
      </button>
      <button onClick={() => void navigate("/org/org/project/project/inbox")}>leave</button>
    </div>
  );
}
afterEach(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("workspace.message-open-preference.v1.")) localStorage.removeItem(key);
  }
  vi.clearAllMocks();
  vi.restoreAllMocks();
  if (originalTouchPoints) Object.defineProperty(navigator, "maxTouchPoints", originalTouchPoints);
  else Reflect.deleteProperty(navigator, "maxTouchPoints");
  window.history.replaceState(null, "");
});
describe("message app entry", () => {
  it("opens web immediately, keeps the CTA at the resolved anchor and removes it on unrelated navigation", () => {
    renderWithProviders(
      <AppMessageEntry>
        <WebMessage />
      </AppMessageEntry>,
      { route: "/org/org/project/project/message/message" },
    );
    expect(screen.getByText("web-message")).toBeInTheDocument();
    expect(buildWorkspaceMessageDesktopLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "resolve" }));
    expect(screen.getByRole("button", { name: t("messageLinkEntry.openApp") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(
      screen.queryByRole("button", { name: t("messageLinkEntry.openApp") }),
    ).not.toBeInTheDocument();
  });
  it("attempts once before mounting web under StrictMode and keeps manual web fallback", () => {
    writeMessageOpenPreference(localStorage, "automatic", "desktop");
    renderWithProviders(
      <StrictMode>
        <AppMessageEntry>
          <div>web-message</div>
        </AppMessageEntry>
      </StrictMode>,
      { route: "/org/automatic/project/project/message/message" },
    );
    expect(buildWorkspaceMessageDesktopLink).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("web-message")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("messageLinkEntry.continueWeb") }));
    expect(screen.getByText("web-message")).toBeInTheDocument();
    expect(buildWorkspaceMessageDesktopLink).toHaveBeenCalledTimes(1);
  });
  it("does not replay automatic opening when this history entry already attempted it", () => {
    writeMessageOpenPreference(localStorage, "return", "desktop");
    window.history.replaceState(
      { workspaceMessageAppAttempt: "/org/return/project/project/message/message" },
      "",
    );
    renderWithProviders(
      <AppMessageEntry>
        <div>web-message</div>
      </AppMessageEntry>,
      { route: "/org/return/project/project/message/message" },
    );
    expect(buildWorkspaceMessageDesktopLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("messageLinkEntry.alwaysWeb") }));
    expect(screen.getByText("web-message")).toBeInTheDocument();
  });
  it("remembers an explicit app choice without a second automatic launch, and keeps web on reload", () => {
    const route = "/org/explicit/project/project/message/message";
    const mounted = renderWithProviders(
      <AppMessageEntry>
        <div>web-message</div>
      </AppMessageEntry>,
      { route },
    );
    expect(
      screen.queryByRole("button", { name: t("messageLinkEntry.alwaysWeb") }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("messageLinkEntry.alwaysApp") }));
    expect(buildWorkspaceMessageDesktopLink).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("web-message")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("messageLinkEntry.continueWeb") }));
    mounted.unmount();
    renderWithProviders(
      <AppMessageEntry>
        <div>web-message</div>
      </AppMessageEntry>,
      { route },
    );
    expect(screen.getByText("web-message")).toBeInTheDocument();
    expect(buildWorkspaceMessageDesktopLink).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: t("messageLinkEntry.alwaysWeb") }));
    expect(
      screen.getByRole("button", { name: t("messageLinkEntry.alwaysApp") }),
    ).toBeInTheDocument();
  });
  it.each([
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5],
    ["Android", "Mozilla/5.0 (Linux; Android 15)", 5],
    ["iPad desktop mode", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5],
  ])(
    "keeps ordinary web without applying the desktop preference on %s",
    (_name, userAgent, maxTouchPoints) => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        get: () => maxTouchPoints,
      });
      writeMessageOpenPreference(localStorage, "mobile", "desktop");
      renderWithProviders(
        <AppMessageEntry>
          <div>web-message</div>
        </AppMessageEntry>,
        { route: "/org/mobile/project/project/message/message" },
      );
      expect(screen.getByText("web-message")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: t("messageLinkEntry.openApp") }),
      ).not.toBeInTheDocument();
      expect(buildWorkspaceMessageDesktopLink).not.toHaveBeenCalled();
    },
  );

  it("does not offer or attempt desktop launch inside a native WebView", () => {
    vi.mocked(isWebView).mockReturnValueOnce(true);
    writeMessageOpenPreference(localStorage, "native", "desktop");
    renderWithProviders(
      <AppMessageEntry>
        <div>web-message</div>
      </AppMessageEntry>,
      { route: "/org/native/project/project/message/message" },
    );
    expect(screen.getByText("web-message")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("messageLinkEntry.openApp") }),
    ).not.toBeInTheDocument();
    expect(buildWorkspaceMessageDesktopLink).not.toHaveBeenCalled();
  });

  it("preserves the mounted web content when unrelated navigation removes the entry banner", () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function Content() {
      useEffect(() => {
        mounted();
        return unmounted;
      }, []);
      return <WebMessage />;
    }
    renderWithProviders(
      <AppMessageEntry>
        <Content />
      </AppMessageEntry>,
      { route: "/org/org/project/project/message/message" },
    );
    fireEvent.click(screen.getByRole("button", { name: "leave" }));
    expect(
      screen.queryByRole("button", { name: t("messageLinkEntry.openApp") }),
    ).not.toBeInTheDocument();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });
});
