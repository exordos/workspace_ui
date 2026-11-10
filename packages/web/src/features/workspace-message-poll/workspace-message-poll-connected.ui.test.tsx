import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { setLocale } from "~/i18n/i18n";
import { WorkspaceMessagePollConnected } from "./workspace-message-poll-connected.ui";

const mocks = vi.hoisted(() => {
  const runtime = {
    accountId: "a",
    instanceId: "i",
    organizationId: "o",
    projectId: "p",
    userUuid: "u",
    runtimeGeneration: 1,
  };
  const auth = {
    currentAccountId: "a",
    runtimeGeneration: 1,
    getCurrentRuntimeContext: () => runtime,
  };
  const messenger = {
    ownerKey: "account:a:instance:i:organization:o:project:p:user:u",
    streamsById: {
      s: { projectId: "p", userUuid: "u", role: "member", sourceName: "native", isArchived: false },
    },
  };
  return { runtime, auth, messenger, mutate: vi.fn(), voters: vi.fn() };
});
vi.mock("~/entities/workspace-auth/workspace-auth.model", () => ({
  selectCurrentWorkspaceRuntimeContext: () => null,
  useWorkspaceAuthStore: Object.assign(
    (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth),
    { getState: () => mocks.auth },
  ),
}));
vi.mock("~/entities/messenger/messenger.model", () => ({
  useMessengerStore: (selector: (state: typeof mocks.messenger) => unknown) =>
    selector(mocks.messenger),
}));
vi.mock("~/entities/messenger/messenger-poll-actions.lib", () => ({
  mutateMessengerPoll: mocks.mutate,
  getMessengerPollVoters: mocks.voters,
}));

const message = {
  uuid: "message",
  streamUuid: "s",
  authorUuid: "u",
  projectId: "p",
  payload: {
    kind: "poll",
    questions: [
      {
        uuid: "q",
        text: "Question",
        options: [
          { uuid: "a", text: "Alpha" },
          { uuid: "b", text: "Beta" },
        ],
        correctOptionUuids: [],
      },
    ],
    multipleAnswers: false,
    isAnonymous: false,
    allowRevote: true,
    resultsVisibility: "always",
    allowAddingOptions: false,
    closesAt: null,
    closedAt: null,
  },
  pollState: {
    revision: 1,
    isClosed: false,
    voterCount: 1,
    questions: [{ questionUuid: "q", voterCount: 1, optionCounts: { a: 1 } }],
    myVotes: [],
  },
} as unknown as MessengerMessage;
const props = {
  message,
  readOnly: false,
  usersById: {},
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
  closeOpen: false,
  setCloseOpen: vi.fn(),
};

beforeEach(() => {
  setLocale("en");
  vi.clearAllMocks();
  mocks.voters.mockReset();
  mocks.voters.mockResolvedValue({ items: [], nextPageMarker: null });
});
describe("connected poll", () => {
  it("loads five recent voters separately from paginated voter lists and refreshes revisions", async () => {
    mocks.voters.mockResolvedValue({ items: [{ uuid: "recent" }], nextPageMarker: null });
    const { rerender } = render(<WorkspaceMessagePollConnected {...props} />);
    expect(await screen.findByTitle("#recent")).toBeInTheDocument();
    expect(mocks.voters).toHaveBeenCalledWith(
      expect.objectContaining({
        order: "recent",
        pageLimit: 5,
        optionUuid: "a",
        questionUuid: "q",
      }),
    );
    mocks.voters.mockResolvedValue({ items: [{ uuid: "newest" }], nextPageMarker: null });
    rerender(
      <WorkspaceMessagePollConnected
        {...props}
        message={{
          ...message,
          pollState: { ...message.pollState!, revision: 2 },
        }}
      />,
    );
    expect(screen.queryByTitle("#recent")).not.toBeInTheDocument();
    expect(await screen.findByTitle("#newest")).toBeInTheDocument();
  });
  it("does not request voter previews for anonymous, read-only, or hidden results", () => {
    const { rerender } = render(<WorkspaceMessagePollConnected {...props} readOnly />);
    rerender(
      <WorkspaceMessagePollConnected
        {...props}
        message={{
          ...message,
          payload: { ...message.payload, isAnonymous: true } as MessengerMessage["payload"],
        }}
      />,
    );
    rerender(
      <WorkspaceMessagePollConnected
        {...props}
        message={{
          ...message,
          payload: {
            ...message.payload,
            resultsVisibility: "after_vote",
          } as MessengerMessage["payload"],
        }}
      />,
    );
    expect(mocks.voters).not.toHaveBeenCalled();
  });
  it("rejects a late preview after a runtime generation switch", async () => {
    let finish!: (value: { items: { uuid: string }[] }) => void;
    mocks.voters.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<WorkspaceMessagePollConnected {...props} />);
    const generation = mocks.runtime.runtimeGeneration;
    mocks.runtime.runtimeGeneration++;
    await act(async () => {
      finish({ items: [{ uuid: "stale" }] });
      await Promise.resolve();
    });
    expect(screen.queryByTitle("#stale")).not.toBeInTheDocument();
    mocks.runtime.runtimeGeneration = generation;
  });
  it("reuses the option UUID when retrying an addition after a lost response", async () => {
    if (message.payload.kind !== "poll") throw new Error("Expected poll");
    mocks.mutate.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(
      <WorkspaceMessagePollConnected
        {...props}
        message={{ ...message, payload: { ...message.payload, allowAddingOptions: true } }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add option/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "New option" }), {
      target: { value: "Another answer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Could not add the option. Try again.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "New option" })).toHaveValue("Another answer");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    const firstAttempt = mocks.mutate.mock.calls[0]?.[0];
    expect(firstAttempt).toMatchObject({
      messageUuid: "message",
      action: { kind: "addOption", questionUuid: "q", option: { text: "Another answer" } },
    });
    expect(mocks.mutate.mock.calls[1]?.[0]).toEqual(firstAttempt);
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
  it("sends a vote immediately and waits for the server snapshot", async () => {
    let finish!: () => void;
    mocks.mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<WorkspaceMessagePollConnected {...props} />);
    const option = screen.getByRole("button", { name: "Alpha" });
    fireEvent.click(option);
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: "message",
        action: { kind: "vote", questionUuid: "q", optionUuid: "a", selected: true },
      }),
    );
    expect(option).toHaveAttribute("aria-pressed", "false");
    expect(option).toBeDisabled();
    finish();
    await waitFor(() => expect(option).toBeEnabled());
  });
  it("loads and appends voter pages using the server marker", async () => {
    mocks.voters.mockImplementation((options: { order?: string; pageMarker?: string }) => {
      if (options.order === "recent") return Promise.resolve({ items: [], nextPageMarker: null });
      return Promise.resolve(
        options.pageMarker
          ? { items: [{ uuid: "two" }], nextPageMarker: null }
          : { items: [{ uuid: "one" }], nextPageMarker: "next" },
      );
    });
    render(<WorkspaceMessagePollConnected {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Who chose .*Alpha/ }));
    expect(await screen.findByText("#one")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("#two")).toBeInTheDocument();
    expect(screen.getByText("#one")).toBeInTheDocument();
    expect(mocks.voters).toHaveBeenLastCalledWith(expect.objectContaining({ pageMarker: "next" }));
  });
});
