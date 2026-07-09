import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { MessageRedirectPage } from "./message-redirect-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

describe("MessageRedirectPage", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    useInstancesStore.setState({ instances: [], currentInstanceId: null });
  });

  it("redirects to login with realm prefill when no saved instance matches", async () => {
    useInstancesStore.setState({
      instances: [{ id: "1" }],
      currentInstanceId: "1",
    });

    render(
      <MemoryRouter initialEntries={["/message/123?realm=https%3A%2F%2Fchat.example.com"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith(
        "/login?realm=https%3A%2F%2Fchat.example.com&redirectTo=%2Fmessage%2F123%3Frealm%3Dhttps%253A%252F%252Fchat.example.com",
        {
          replace: true,
        },
      );
    });
  });

  it("fails fast for non-decimal message id params", async () => {
    useInstancesStore.setState({
      instances: [{ id: "1" }],
      currentInstanceId: "1",
    });

    render(
      <MemoryRouter initialEntries={["/message/1e3"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load page")).toBeInTheDocument();
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("shows access denied error for numeric legacy message links", async () => {
    useInstancesStore.setState({
      instances: [{ id: "1" }],
      currentInstanceId: "1",
    });

    render(
      <MemoryRouter initialEntries={["/message/123"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No access to the original message or chat")).toBeInTheDocument();
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("ignores invalid realm query values and shows access denied", async () => {
    useInstancesStore.setState({
      instances: [{ id: "1" }],
      currentInstanceId: "1",
    });

    render(
      <MemoryRouter initialEntries={["/message/123?realm=javascript%3Aalert(1)"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No access to the original message or chat")).toBeInTheDocument();
    });
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
