import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { renderWithProviders } from "~/test/render";
import { InstanceSwitcher } from "./instance-switch.ui";

function resetStore() {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    unreadCountsByInstance: {},
  });
}

describe("InstanceSwitcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });

  it("shows per-instance unread badge in dropdown", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: { "inst-1": 0, "inst-2": 4 },
    });

    renderWithProviders(<InstanceSwitcher />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByTestId("instance-unread-inst-2")).toHaveTextContent("4");
  });

  it("positions dropdown unread badge in top-right corner of organization logo", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: { "inst-1": 0, "inst-2": 4 },
    });

    renderWithProviders(<InstanceSwitcher />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });

    const secondItem = (await screen.findByText("b.example.com")).closest('[role="menuitem"]');
    const logoContainer = secondItem?.querySelector('[data-testid="instance-logo-inst-2"]');
    const unreadBadge = await screen.findByTestId("instance-unread-inst-2");

    expect(logoContainer).toBeInTheDocument();
    expect(logoContainer).toContainElement(unreadBadge);
    expect(unreadBadge).toHaveClass("absolute");
    expect(unreadBadge).toHaveClass("-top-1");
    expect(unreadBadge).toHaveClass("-right-1");
  });

  it("keeps add-organization action only inside dropdown", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<InstanceSwitcher />);

    expect(screen.queryByRole("button", { name: /add server/i })).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByText(/add server/i)).toBeInTheDocument();
  });

  it("shows all connected organizations in dropdown with their logos", async () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://a.example.com",
          email: "a@example.com",
          apiKey: "k1",
          realmIcon: "https://cdn.example.com/a.svg",
        },
        {
          id: "inst-2",
          realm: "https://b.example.com",
          email: "b@example.com",
          apiKey: "k2",
          realmIcon: "https://cdn.example.com/b.svg",
        },
        { id: "inst-3", realm: "https://c.example.com", email: "c@example.com", apiKey: "k3" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<InstanceSwitcher />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });

    const firstItem = (await screen.findByText("a.example.com")).closest('[role="menuitem"]');
    const secondItem = screen.getByText("b.example.com").closest('[role="menuitem"]');
    const thirdItem = screen.getByText("c.example.com").closest('[role="menuitem"]');

    expect(firstItem).toBeInTheDocument();
    expect(secondItem).toBeInTheDocument();
    expect(thirdItem).toBeInTheDocument();

    expect(firstItem?.querySelector("img")).toHaveAttribute("src", "https://cdn.example.com/a.svg");
    expect(secondItem?.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/b.svg",
    );
    expect(thirdItem?.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(firstItem?.querySelector("img")).toHaveClass("h-9");
    expect(firstItem?.querySelector("img")).toHaveClass("w-9");
    expect(firstItem?.querySelector("img")).not.toHaveClass("rounded-full");
    expect(secondItem?.querySelector("img")).toHaveClass("h-9");
    expect(secondItem?.querySelector("img")).toHaveClass("w-9");
    expect(secondItem?.querySelector("img")).not.toHaveClass("rounded-full");
    expect(thirdItem?.querySelector("img")).toHaveClass("h-9");
    expect(thirdItem?.querySelector("img")).toHaveClass("w-9");
    expect(thirdItem?.querySelector("img")).not.toHaveClass("rounded-full");
  });

  it("shows noticeable logout action and confirms before removing organization", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<InstanceSwitcher />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });

    const logoutButtons = await screen.findAllByRole("button", {
      name: /logout from organization/i,
    });
    expect(logoutButtons[0]).toHaveClass("text-notice-base");
    expect(logoutButtons[0]).not.toHaveClass("opacity-0");
    expect(logoutButtons[0]).toHaveClass("h-6");
    expect(logoutButtons[0]).toHaveClass("w-6");
    expect(logoutButtons[0]).not.toHaveTextContent(/logout from organization/i);
    expect(logoutButtons[0]?.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(logoutButtons[0]!);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("a.example.com"));
    expect(useInstancesStore.getState().instances).toHaveLength(2);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: /logout from organization/i }))[0]!,
    );
    expect(useInstancesStore.getState().instances).toHaveLength(1);
  });

  it("renders quick instance icons and switches active instance on click", () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: { "inst-1": 0, "inst-2": 0 },
    });

    renderWithProviders(<InstanceSwitcher />);

    const secondInstanceButton = screen.getByRole("button", { name: "b.example.com" });
    fireEvent.click(secondInstanceButton);

    expect(useInstancesStore.getState().currentInstanceId).toBe("inst-2");
  });

  it("resolves realm-relative organization icon against instance realm url", () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://chat.example.com",
          email: "a@example.com",
          apiKey: "k1",
          realmIcon: "/user_avatars/1/realm/icon.png",
        },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<InstanceSwitcher />);

    const logo = screen.getByTestId("instance-quick-inst-1").querySelector("img");
    expect(logo).toHaveAttribute("src", "https://chat.example.com/user_avatars/1/realm/icon.png");
  });

  it("uses organization logo in quick header slots when realm icon is available", () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://a.example.com",
          email: "a@example.com",
          apiKey: "k1",
          realmIcon: "https://cdn.example.com/realm-a.svg",
        },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<InstanceSwitcher />);

    const firstButton = screen.getByTestId("instance-quick-inst-1");
    const secondButton = screen.getByTestId("instance-quick-inst-2");

    expect(firstButton.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/realm-a.svg",
    );
    expect(firstButton.querySelector("img")).not.toHaveClass("rounded-full");
    expect(secondButton.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(secondButton.querySelector("img")).not.toHaveClass("rounded-full");
  });

  it("falls back to local organization logo when realm icon fails to load", () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://a.example.com",
          email: "a@example.com",
          apiKey: "k1",
          realmIcon: "https://cdn.example.com/broken-logo.svg",
        },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<InstanceSwitcher />);

    const logo = screen.getByTestId("instance-quick-inst-1").querySelector("img");
    expect(logo).toHaveAttribute("src", "https://cdn.example.com/broken-logo.svg");

    fireEvent.error(logo!);

    expect(logo).toHaveAttribute("src", expect.stringContaining("organization-fallback.svg"));
  });

  it("shows only three organizations in header and moves rest to dropdown overflow", () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
        { id: "inst-3", realm: "https://c.example.com", email: "c@example.com", apiKey: "k3" },
        { id: "inst-4", realm: "https://d.example.com", email: "d@example.com", apiKey: "k4" },
        { id: "inst-5", realm: "https://e.example.com", email: "e@example.com", apiKey: "k5" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    const { container } = renderWithProviders(<InstanceSwitcher />);
    const quickButtons = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="instance-quick-"]'),
    );

    expect(quickButtons).toHaveLength(3);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("sorts organizations by user selection order", () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
        { id: "inst-3", realm: "https://c.example.com", email: "c@example.com", apiKey: "k3" },
        { id: "inst-4", realm: "https://d.example.com", email: "d@example.com", apiKey: "k4" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    const { container } = renderWithProviders(<InstanceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "c.example.com" }));

    const quickIds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="instance-quick-"]'),
    ).map((element) => element.dataset.testid?.replace("instance-quick-", ""));

    expect(quickIds).toEqual(["inst-3", "inst-1", "inst-2"]);
  });

  it("promotes hidden organization into visible header when selected from dropdown", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
        { id: "inst-3", realm: "https://c.example.com", email: "c@example.com", apiKey: "k3" },
        { id: "inst-4", realm: "https://d.example.com", email: "d@example.com", apiKey: "k4" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    const { container } = renderWithProviders(<InstanceSwitcher />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByText("d.example.com"));

    const quickIds = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="instance-quick-"]'),
    ).map((element) => element.dataset.testid?.replace("instance-quick-", ""));

    expect(quickIds).toEqual(["inst-4", "inst-1", "inst-2"]);
  });

  it("keeps active quick logo without filled background or outline and keeps chevron trigger borderless", () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: { "inst-1": 1, "inst-2": 0 },
    });

    renderWithProviders(<InstanceSwitcher />);

    const activeButton = screen.getByRole("button", { name: /current server: a.example.com/i });
    expect(activeButton).toHaveClass("h-9");
    expect(activeButton).toHaveClass("w-9");
    expect(activeButton).not.toHaveClass("bg-card-bg-active");
    expect(activeButton).not.toHaveClass("ring-1");
    expect(activeButton).not.toHaveClass("ring-accent-soft");
    expect(activeButton).not.toHaveClass("border");

    const selectorButton = screen.getByRole("button", { name: /select zulip server/i });
    expect(selectorButton).toBeInTheDocument();
    expect(selectorButton).not.toHaveClass("border");
  });

  it("shows unread badge for the current instance item when unread > 0", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: { "inst-1": 2, "inst-2": 0 },
    });

    renderWithProviders(<InstanceSwitcher />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(await screen.findByTestId("instance-unread-inst-1")).toHaveTextContent("2");
    expect(screen.queryByTestId("instance-unread-inst-2")).not.toBeInTheDocument();
  });

  it("updates dropdown unread badge when store count changes", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "inst-1", realm: "https://a.example.com", email: "a@example.com", apiKey: "k1" },
        { id: "inst-2", realm: "https://b.example.com", email: "b@example.com", apiKey: "k2" },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: { "inst-1": 0, "inst-2": 0 },
    });

    renderWithProviders(<InstanceSwitcher />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /select zulip server/i }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.queryByTestId("instance-unread-inst-2")).not.toBeInTheDocument();

    useInstancesStore.getState().setInstanceUnreadCount("inst-2", 6);

    expect(await screen.findByTestId("instance-unread-inst-2")).toHaveTextContent("6");
  });
});
