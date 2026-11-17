import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { setLocale } from "~/i18n/i18n";
import { RightPanelUserAppearance } from "~/widgets/right-panel/right-panel-user-settings.ui";
import { useChatBackground } from "./chat-background.hook";
import {
  CHAT_BACKGROUNDS,
  chatBackgroundStorageKey,
  parseChatBackgroundPreferences,
} from "./chat-background.lib";
import { ChatBackground, ChatBackgroundSettings } from "./chat-background.ui";
import type { ReactNode } from "react";
const prepare = vi.hoisted(() => vi.fn());
vi.mock("./chat-background.lib", async () => ({
  ...(await vi.importActual("./chat-background.lib")),
  prepareChatBackground: prepare,
}));
const jpeg = "data:image/jpeg;base64,AQID";
const stream = "11111111-1111-4111-8111-111111111111";
const topicA = "22222222-2222-4222-8222-222222222222";
const topicB = "33333333-3333-4333-8333-333333333333";
const conversationA = `topic:${stream}:${topicA}`;
const conversationB = `topic:${stream}:${topicB}`;
const routeA = `/org/demo.invalid/project/d0000000-0000-4000-8000-000000000001/stream/${stream}/topic/${topicA}`;
beforeEach(() => {
  const session = (id: string) => ({
    accountId: `background-account-${id}`,
    instanceId: "background-instance",
    organizationId: "demo.invalid",
    organizationOrigin: "https://demo.invalid",
    projectId: "d0000000-0000-4000-8000-000000000001",
    userUuid: "d0000000-0000-4000-8000-000000000002",
    runtimeGeneration: 1,
    accessToken: "synthetic-test-access",
    refreshToken: "synthetic-test-refresh",
    login: "fixture@example.invalid",
    profile: {
      uuid: "d0000000-0000-4000-8000-000000000002",
      username: "fixture",
      firstName: null,
      lastName: null,
      email: null,
    },
  });
  useWorkspaceAuthStore.setState({
    sessions: [session("a"), session("b")],
    currentAccountId: "background-account-a",
    runtimeGeneration: 1,
  });
  Object.keys(localStorage)
    .filter((key) => key.startsWith("workspace-chat-background-v1:"))
    .forEach((key) => localStorage.removeItem(key));
  setLocale("en");
  vi.clearAllMocks();
  prepare.mockResolvedValue(jpeg);
});
afterEach(() => {
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  vi.restoreAllMocks();
});
function Router({ children }: { readonly children: ReactNode }) {
  return <MemoryRouter initialEntries={[routeA]}>{children}</MemoryRouter>;
}
function Surface({ conversationId = conversationA }: { readonly conversationId?: string }) {
  return (
    <ChatBackground conversationId={conversationId}>
      <p>Chat message</p>
    </ChatBackground>
  );
}
function Both({ twoChats = false }: { readonly twoChats?: boolean }) {
  return (
    <Router>
      <Surface />
      {twoChats ? <Surface conversationId={conversationB} /> : null}
      <ChatBackgroundSettings />
    </Router>
  );
}
const currentStyle = (index = 0) =>
  screen.getAllByTestId("chat-background")[index]?.style.backgroundImage;
const confirmScope = (scope: "For all chats" | "Only this chat") =>
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Apply background" })).getByRole("button", {
      name: scope,
    }),
  );
const selectFile = () =>
  fireEvent.change(screen.getByLabelText("Choose a background image file"), {
    target: { files: [new File(["fixture"], "mine.png", { type: "image/png" })] },
  });
describe("appearance backgrounds", () => {
  it("restores keyboard focus to the selected preset after confirmation", async () => {
    const user = userEvent.setup();
    render(<Both />);
    const trigger = screen.getByRole("button", { name: "Sea" });
    trigger.focus();
    await user.keyboard("[Enter]");
    const confirm = within(screen.getByRole("dialog", { name: "Apply background" })).getByRole(
      "button",
      { name: "For all chats" },
    );
    confirm.focus();
    await user.keyboard("[Enter]");
    expect(trigger).toHaveFocus();
  });
  it("rejects a saved apply callback after leaving and returning to the same account", () => {
    const { result } = renderHook(() => useChatBackground(conversationA));
    const oldApply = result.current.apply;
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-b"));
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-a"));
    expect(oldApply({ preset: "forest" }, "all")).toBe(false);
    expect(localStorage.getItem(result.current.key!)).toBeNull();
    act(() => {
      expect(result.current.apply({ preset: "sea" }, "all")).toBe(true);
    });
    expect(result.current.background).toEqual({ preset: "sea" });
  });
  it("discards a pending confirmation when the account changes", () => {
    render(<Both />);
    fireEvent.click(screen.getByRole("button", { name: "Sea" }));
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-b"));
    expect(screen.queryByRole("dialog", { name: "Apply background" })).not.toBeInTheDocument();
    expect(currentStyle()).toBe("");
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-a"));
    expect(currentStyle()).toBe("");
  });
  it("adds the fifth appearance row with the picture icon and a two-by-two preset/upload grid", () => {
    render(
      <Router>
        <RightPanelUserAppearance onBack={vi.fn()} onClose={vi.fn()} />
      </Router>,
    );
    const sections = screen.getByTestId("right-panel-appearance-sections");
    expect(sections.children).toHaveLength(5);
    const row = screen.getByRole("button", { name: "Chat background" });
    expect(sections.lastElementChild).toContainElement(row);
    expect(row.querySelector("svg")).not.toBeNull();
    fireEvent.click(row);
    const options = screen.getByTestId("chat-background-options");
    const grid = within(options).getByRole("button", { name: "Mountains" }).parentElement;
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid?.children).toHaveLength(4);
    expect(grid?.lastElementChild).toHaveAccessibleName("Add your own image");
    for (const name of ["Mountains", "Sea", "Forest"])
      expect(within(options).getByRole("button", { name })).toBeInTheDocument();
    expect(within(options).getByRole("button", { name: "Add your own image" })).toBeInTheDocument();
  });
  it("waits for confirmation, restores the confirmed preset after remount and confirms reset", () => {
    const view = render(<Both />);
    fireEvent.click(screen.getByRole("button", { name: "Sea" }));
    expect(screen.getByRole("dialog", { name: "Apply background" })).toBeInTheDocument();
    expect(currentStyle()).toBe("");
    confirmScope("For all chats");
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[1].image);
    view.unmount();
    render(<Both />);
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[1].image);
    expect(screen.getByRole("button", { name: "Sea" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Default background" }));
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[1].image);
    confirmScope("For all chats");
    expect(currentStyle()).toBe("");
  });
  it("cancels a pending selection without changing the current background", () => {
    render(<Both />);
    fireEvent.click(screen.getByRole("button", { name: "Sea" }));
    confirmScope("For all chats");
    fireEvent.click(screen.getByRole("button", { name: "Forest" }));
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[1].image);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Apply background" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Apply background" })).not.toBeInTheDocument();
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[1].image);
    expect(screen.getByRole("button", { name: "Sea" })).toHaveAttribute("aria-pressed", "true");
  });
  it("applies only to the selected conversation while another conversation keeps the global background", () => {
    const view = render(<Both twoChats />);
    fireEvent.click(screen.getByRole("button", { name: "Sea" }));
    confirmScope("For all chats");
    fireEvent.click(screen.getByRole("button", { name: "Forest" }));
    expect(currentStyle(0)).toContain(CHAT_BACKGROUNDS[1].image);
    expect(currentStyle(1)).toContain(CHAT_BACKGROUNDS[1].image);
    confirmScope("Only this chat");
    expect(currentStyle(0)).toContain(CHAT_BACKGROUNDS[2].image);
    expect(currentStyle(1)).toContain(CHAT_BACKGROUNDS[1].image);
    view.unmount();
    render(<Both twoChats />);
    expect(currentStyle(0)).toContain(CHAT_BACKGROUNDS[2].image);
    expect(currentStyle(1)).toContain(CHAT_BACKGROUNDS[1].image);
  });
  it("applies a new global background to every chat and clears previous chat overrides", () => {
    const view = render(<Both twoChats />);
    fireEvent.click(screen.getByRole("button", { name: "Forest" }));
    confirmScope("Only this chat");
    expect(currentStyle(0)).toContain(CHAT_BACKGROUNDS[2].image);
    expect(currentStyle(1)).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Mountains" }));
    confirmScope("For all chats");
    expect(currentStyle(0)).toContain(CHAT_BACKGROUNDS[0].image);
    expect(currentStyle(1)).toContain(CHAT_BACKGROUNDS[0].image);
    view.unmount();
    render(<Both twoChats />);
    expect(currentStyle(0)).toContain(CHAT_BACKGROUNDS[0].image);
    expect(currentStyle(1)).toContain(CHAT_BACKGROUNDS[0].image);
  });
  it("resets only the selected chat while retaining the global background in other chats", () => {
    render(<Both twoChats />);
    fireEvent.click(screen.getByRole("button", { name: "Sea" }));
    confirmScope("For all chats");
    fireEvent.click(screen.getByRole("button", { name: "Default background" }));
    confirmScope("Only this chat");
    expect(currentStyle(0)).toBe("");
    expect(currentStyle(1)).toContain(CHAT_BACKGROUNDS[1].image);
  });
  it("asks for scope after converting a custom JPEG and persists it without a network upload", async () => {
    const fetch = vi.spyOn(window, "fetch");
    render(<Both twoChats />);
    selectFile();
    await screen.findByRole("dialog", { name: "Apply background" });
    expect(currentStyle(0)).toBe("");
    expect(currentStyle(1)).toBe("");
    confirmScope("Only this chat");
    expect(currentStyle(0)).toContain(jpeg);
    expect(currentStyle(1)).toBe("");
    expect(screen.getByAltText("Your image")).toHaveAttribute("src", jpeg);
    expect(prepare).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("discards a late file conversion after leaving and returning to the runtime", async () => {
    let finish!: (value: string) => void;
    prepare.mockReturnValue(
      new Promise((r) => {
        finish = r;
      }),
    );
    render(<Both />);
    selectFile();
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-b"));
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-a"));
    await act(async () => {
      finish(jpeg);
      await Promise.resolve();
    });
    expect(currentStyle()).toBe("");
    expect(screen.queryByRole("dialog", { name: "Apply background" })).not.toBeInTheDocument();
  });
  it("retains the previous background when persistence fails after confirming", () => {
    render(<Both />);
    fireEvent.click(screen.getByRole("button", { name: "Sea" }));
    confirmScope("For all chats");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: "Forest" }));
    confirmScope("For all chats");
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[1].image);
    expect(screen.getByRole("alert")).toHaveTextContent("previous background was kept");
  });
  it("allows a preset to supersede a pending image conversion", async () => {
    let finish!: (value: string) => void;
    prepare.mockReturnValue(
      new Promise((r) => {
        finish = r;
      }),
    );
    render(<Both />);
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Mountains" }));
    await act(async () => {
      finish(jpeg);
      await Promise.resolve();
    });
    expect(currentStyle()).toBe("");
    confirmScope("For all chats");
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[0].image);
  });
  it("keeps the background owner-scoped when accounts change", () => {
    render(<Both />);
    fireEvent.click(screen.getByRole("button", { name: "Sea" }));
    confirmScope("For all chats");
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-b"));
    expect(currentStyle()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Forest" }));
    confirmScope("For all chats");
    act(() => useWorkspaceAuthStore.getState().setCurrentAccountId("background-account-a"));
    expect(currentStyle()).toContain(CHAT_BACKGROUNDS[1].image);
  });
  it("does not read or persist background preferences while logged out", () => {
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 2 });
    const read = vi.spyOn(Storage.prototype, "getItem");
    render(<Both />);
    expect(currentStyle()).toBe("");
    expect(screen.getByRole("button", { name: "Sea" })).toBeDisabled();
    expect(
      read.mock.calls.some(([key]) => String(key).startsWith("workspace-chat-background-v1:")),
    ).toBe(false);
  });
});
describe("local background restoration boundary", () => {
  it("rejects external URLs, SVG data, oversized entries and damaged preferences", () => {
    for (const raw of [
      "invalid",
      JSON.stringify({ image: "https://example.invalid/a.jpg" }),
      JSON.stringify({ image: "data:image/svg+xml;base64,PHN2Zz4=" }),
      JSON.stringify({ preset: "unknown" }),
      "x".repeat(2_000_001),
    ])
      expect(parseChatBackgroundPreferences(raw)).toEqual({ global: null, chats: {} });
    expect(parseChatBackgroundPreferences(JSON.stringify({ image: jpeg }))).toEqual({
      global: { image: jpeg },
      chats: {},
    });
    expect(chatBackgroundStorageKey("owner-a")).not.toBe(chatBackgroundStorageKey("owner-b"));
  });
});
