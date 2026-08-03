import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useMentionSuggestStore } from "~/features/mention-suggest/mention-suggest.model";
import { renderWithProviders } from "~/test/render";
import { computeFloatingPickerPosition } from "./message-composer-picker-position.lib";
import { resetComposerSavedSnippetsModelForTests } from "./message-composer-saved-snippets.model";
import { TOOLBAR_ICON_SIZE } from "./message-composer-styles.lib";
import { MessageComposer } from "./message-composer.ui";

const isWebViewMock = vi.fn(() => false);
const useViewportKeyboardMock = vi.fn(() => ({ isOpen: false, keyboardHeight: 0 }));
const emojiPickerMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/config/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/config/constants")>();
  return { ...actual, KEYBOARD_SHORTCUTS_ENABLED: true };
});

vi.mock("~/shared/lib/webview", async () => {
  const actual = await vi.importActual("~/shared/lib/webview");
  return {
    ...actual,
    isWebView: () => isWebViewMock(),
  };
});

vi.mock("~/shared/lib/touch", async () => {
  const actual = await vi.importActual("~/shared/lib/touch");
  return {
    ...actual,
    useViewportKeyboard: () => useViewportKeyboardMock(),
  };
});

vi.mock("emoji-picker-react", () => ({
  default: (props: {
    onEmojiClick?: (data: { emoji: string }) => void;
    className?: string;
    emojiStyle?: string;
  }) => {
    emojiPickerMock(props);
    return (
      <button
        type="button"
        className={props.className}
        onClick={() => props.onEmojiClick?.({ emoji: "😀" })}
      >
        Pick emoji
      </button>
    );
  },
  Theme: {
    LIGHT: "light",
    DARK: "dark",
  },
  EmojiStyle: {
    NATIVE: "native",
  },
}));

vi.mock("~/features/ai-reply/ai-reply.ui", () => ({
  AiComposerButton: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      AI
    </button>
  ),
  SmartReplySuggestions: () => null,
}));

vi.mock("~/features/sticker-picker/sticker-picker.ui", () => ({
  StickerPicker: () => <div data-testid="sticker-picker-mock">Sticker picker</div>,
}));

vi.mock("~/entities/sticker/sticker.api", () => ({
  buildStickerMarkdown: () => ":sticker:",
}));

afterEach(() => {
  useMessengerStore.getState().clear();
  useUsersStore.getState().clear();
  useMentionSuggestStore.getState().clear();
  isWebViewMock.mockReset();
  isWebViewMock.mockReturnValue(false);
  useViewportKeyboardMock.mockReset();
  useViewportKeyboardMock.mockReturnValue({ isOpen: false, keyboardHeight: 0 });
  emojiPickerMock.mockReset();
});

beforeEach(() => {
  resetComposerSavedSnippetsModelForTests();
});

const focusComposerInput = () => {
  const textbox = screen.getByRole("textbox");
  fireEvent.focus(textbox);
  return textbox;
};

const TEST_USER_TIMESTAMP = new Date(0).toISOString();

function createWorkspaceUser(overrides: Partial<User> = {}): User {
  const uuid = overrides.uuid ?? "workspace-user-uuid";
  const username = overrides.username ?? uuid;
  return {
    uuid,
    username,
    firstName: overrides.firstName ?? null,
    lastName: overrides.lastName ?? null,
    displayName: overrides.displayName ?? username,
    email: overrides.email ?? `${username}@example.com`,
    avatarUrl: overrides.avatarUrl ?? null,
    status: overrides.status ?? "offline",
    statusEmoji: overrides.statusEmoji ?? null,
    statusText: overrides.statusText ?? null,
    lastPingAt: overrides.lastPingAt ?? TEST_USER_TIMESTAMP,
    createdAt: overrides.createdAt ?? TEST_USER_TIMESTAMP,
    updatedAt: overrides.updatedAt ?? TEST_USER_TIMESTAMP,
  };
}

const COMPOSER_STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const COMPOSER_TOPIC_UUID = "22222222-2222-4222-8222-222222222222";
const COMPOSER_OWNER_KEY = "composer-workspace-owner";

function createComposerStream(): MessengerStream {
  return {
    uuid: COMPOSER_STREAM_UUID,
    projectId: "project-uuid",
    ownerUuid: "owner-uuid",
    userUuid: "user-uuid",
    role: "member",
    notificationMode: "all_messages",
    name: "Engineering",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "",
    updatedAt: "",
  };
}

function createComposerTopic(): MessengerTopic {
  return {
    uuid: COMPOSER_TOPIC_UUID,
    projectId: "project-uuid",
    streamUuid: COMPOSER_STREAM_UUID,
    userUuid: "user-uuid",
    name: "Releases",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "",
    updatedAt: "",
  };
}

function seedComposerWorkspaceStore(): void {
  const store = useMessengerStore.getState();
  store.startBootstrap(COMPOSER_OWNER_KEY);
  store.upsertStream(COMPOSER_OWNER_KEY, createComposerStream());
  store.upsertTopic(COMPOSER_OWNER_KEY, createComposerTopic());
}

describe("MessageComposer async send behavior", () => {
  it("sends the parent-provided outgoing body instead of the active draft", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const outgoingBody = "Full Workspace reply A\n\nFull Workspace reply B";

    renderWithProviders(
      <MessageComposer
        onSend={onSend}
        initialValue="Active tab reply"
        outgoingBodyOverride={outgoingBody}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(outgoingBody, "", undefined);
    });
  });

  it("allows an empty active draft only when the external body has content", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <MessageComposer
        onSend={onSend}
        outgoingBodyOverride="Reply from another tab"
        allowEmptyActiveValueSend
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Reply from another tab", "", undefined);
    });
  });

  it("does not send when the external body is empty even if empty active sends are allowed", () => {
    const onSend = vi.fn();

    renderWithProviders(
      <MessageComposer onSend={onSend} outgoingBodyOverride="" allowEmptyActiveValueSend />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps the composer draft until onSend resolves successfully", async () => {
    let resolveSend: () => void = () => {
      throw new Error("Expected send resolver to be assigned");
    };
    const onSend = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSend = resolve;
      }),
    );

    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Hello world" } });
    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    expect(onSend).toHaveBeenCalledWith("Hello world", "", undefined);
    expect(textbox).toHaveValue("Hello world");

    resolveSend();
    await waitFor(() => {
      expect(textbox).toHaveValue("");
    });
  });

  it("clears optimistically and accepts the next message while the first send is pending", async () => {
    let resolveFirstSend: () => void = () => {
      throw new Error("Expected send resolver to be assigned");
    };
    const onSend = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSend = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    renderWithProviders(<MessageComposer onSend={onSend} optimisticClearOnSend />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "First message" } });
    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenNthCalledWith(1, "First message", "", undefined);
      expect(textbox).toHaveValue("");
      expect(textbox).not.toBeDisabled();
    });

    fireEvent.change(textbox, { target: { value: "Second message" } });
    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenNthCalledWith(2, "Second message", "", undefined);
      expect(textbox).toHaveValue("");
    });

    resolveFirstSend();
  });

  it("marks optimistic reply cleanup as a submit", async () => {
    const onSend = vi.fn().mockReturnValue(
      new Promise<void>(() => {
        // Keep the send pending to verify optimistic cleanup.
      }),
    );
    const onClearReply = vi.fn();
    const onValueChange = vi.fn();

    renderWithProviders(
      <MessageComposer
        onSend={onSend}
        optimisticClearOnSend
        initialValue="sent reply"
        replyQuote={{
          id: "reply-a",
          content: "quoted message",
          sender_full_name: "Bob Reed",
          sender_uuid: "user-b",
          permalinkUrl: "/messages/reply-a",
          quoteFormat: "workspace",
        }}
        onClearReply={onClearReply}
        onValueChange={onValueChange}
      />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledOnce();
      expect(textbox).toHaveValue("");
      expect(onValueChange).toHaveBeenCalledWith("");
      expect(onClearReply).toHaveBeenCalledWith("submit");
    });
  });

  it("keeps the visible draft when a successful send reports a newer draft", async () => {
    const onClearReply = vi.fn();
    const onSend = vi.fn().mockResolvedValue({ shouldClearComposer: false });

    renderWithProviders(
      <MessageComposer
        onSend={onSend}
        draftSessionKey="workspace-chat-a"
        initialValue="newer draft"
        replyQuote={{
          id: "reply-a",
          content: "quoted message",
          sender_full_name: "Bob Reed",
          sender_uuid: "user-b",
          permalinkUrl: "/messages/reply-a",
          quoteFormat: "workspace",
        }}
        onClearReply={onClearReply}
      />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(expect.stringContaining("newer draft"), "", undefined);
    });
    expect(textbox).toHaveValue("newer draft");
    expect(onClearReply).not.toHaveBeenCalled();
  });

  it("prevents duplicate sends while previous async send is still pending", async () => {
    let resolveFirstSend: () => void = () => {
      throw new Error("Expected first send resolver to be assigned");
    };
    const onSend = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSend = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "First message" } });
    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenNthCalledWith(1, "First message", "", undefined);
      expect(textbox).toHaveValue("First message");
      expect(textbox).toBeDisabled();
    });

    fireEvent.keyDown(textbox, { key: "Enter", code: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);

    resolveFirstSend();
    await waitFor(() => {
      expect(textbox).toHaveValue("");
      expect(textbox).not.toBeDisabled();
      expect(textbox).toHaveFocus();
    });
  });

  it("keeps the composer draft when async onSend rejects", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("send failed"));

    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Draft text" } });
    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Draft text", "", undefined);
    });

    expect(textbox).toHaveValue("Draft text");
  });

  it.each([
    { value: "@ali", query: "ali", seed: "mention" },
    { value: "#eng", query: "eng", seed: "reference" },
  ])("closes stale $seed suggestions after a successful send", async ({ value, query, seed }) => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    if (seed === "mention") {
      useUsersStore.getState().upsertUsers([
        createWorkspaceUser({
          uuid: "user-alice-johnson",
          displayName: "Alice Johnson",
          username: "alice",
        }),
      ]);
    } else {
      seedComposerWorkspaceStore();
    }

    renderWithProviders(
      <MessageComposer onSend={onSend} capabilities={{ mentions: { mode: "enabled" } }} />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value, selectionStart: value.length } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    if (seed === "mention") {
      expect(useMentionSuggestStore.getState().query).toBe(query);
    }
    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalled();
      expect(textbox).toHaveValue("");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
    expect(textbox).not.toHaveAttribute("aria-controls");
    expect(textbox).not.toHaveAttribute("aria-activedescendant");
    expect(useMentionSuggestStore.getState().visible).toBe(false);
    expect(useMentionSuggestStore.getState().query).toBe("");
  });

  it("restores textarea focus when parent re-enables composer after async send", async () => {
    const ComposerWithSendLock = () => {
      const [locked, setLocked] = useState(false);
      const onSend = useCallback(async () => {
        setLocked(true);
        await Promise.resolve();
        setLocked(false);
      }, []);
      return <MessageComposer onSend={onSend} disabled={locked} />;
    };

    renderWithProviders(<ComposerWithSendLock />);

    const textbox = screen.getByRole("textbox");
    textbox.focus();
    expect(textbox).toHaveFocus();

    fireEvent.change(textbox, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(textbox).toHaveFocus();
    });
  });
});

describe("MessageComposer textarea autosize", () => {
  it("starts with single-line height by default", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    expect(textbox.style.height).toBe("40px");
  });

  it("auto-resizes on input and caps height at max", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    let mockedScrollHeight = 96;

    Object.defineProperty(textbox, "scrollHeight", {
      configurable: true,
      get: () => mockedScrollHeight,
    });

    fireEvent.change(textbox, { target: { value: "Line 1\nLine 2\nLine 3", selectionStart: 20 } });
    expect(textbox.style.height).toBe("96px");

    mockedScrollHeight = 300;
    fireEvent.change(textbox, {
      target: { value: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6", selectionStart: 41 },
    });
    expect(textbox.style.height).toBe("128px");
  });
});

describe("MessageComposer scheduled send", () => {
  it("hides the schedule trigger until server-backed scheduled send is wired", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    expect(screen.queryByRole("button", { name: /message menu/i })).not.toBeInTheDocument();
  });
});

describe("MessageComposer saved snippets", () => {
  it("hides saved snippets when the action is unsupported", () => {
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        capabilities={{
          savedSnippets: {
            mode: "unsupported",
            unsupportedText: "Saved snippets are not connected.",
          },
        }}
      />,
    );

    focusComposerInput();

    expect(screen.queryByRole("button", { name: /saved snippets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /filter snippets/i })).not.toBeInTheDocument();
  });

  it("opens an empty saved snippets stub without fetching legacy snippets", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.focus(textbox);
    fireEvent.click(screen.getByRole("button", { name: /saved snippets/i }));

    expect(await screen.findByRole("textbox", { name: /filter snippets/i })).toBeInTheDocument();
    expect(screen.getByText("No matching results")).toBeInTheDocument();
    expect(textbox).toHaveValue("");
  });

  it("keeps the empty stub when filtering snippets", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.click(screen.getByRole("button", { name: /saved snippets/i }));

    const filterInput = await screen.findByRole("textbox", { name: /filter snippets/i });
    fireEvent.change(filterInput, { target: { value: "does-not-exist" } });

    expect(screen.getByText("No matching results")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create new saved snippet/i })).toBeInTheDocument();
  });

  it("reopens the empty saved snippets stub without fetching", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    fireEvent.focus(screen.getByRole("textbox"));
    const trigger = screen.getByRole("button", { name: /saved snippets/i });

    fireEvent.click(trigger);
    await screen.findByRole("textbox", { name: /filter snippets/i });
    fireEvent.click(trigger);

    fireEvent.click(trigger);
    await screen.findByRole("textbox", { name: /filter snippets/i });
  });

  it("shows unsupported when creating a saved snippet from the current draft", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Current draft body" } });
    fireEvent.focus(textbox);
    fireEvent.click(screen.getByRole("button", { name: /saved snippets/i }));

    fireEvent.click(await screen.findByRole("button", { name: /create new saved snippet/i }));

    const titleInput = await screen.findByRole("textbox", { name: /snippet title/i });
    const contentInput = screen.getByRole("textbox", { name: /snippet content/i });
    fireEvent.change(titleInput, { target: { value: "Bug report" } });
    fireEvent.change(contentInput, { target: { value: "Current draft body" } });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText("Saved snippets are not connected yet.")).toBeInTheDocument();
    });
  });
});

describe("MessageComposer mention suggestions", () => {
  it("does not open hash suggestions in the legacy composer", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "#eng", selectionStart: 4 } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects a Workspace hash reference and clears suggestion state", async () => {
    seedComposerWorkspaceStore();
    renderWithProviders(
      <MessageComposer onSend={vi.fn()} capabilities={{ mentions: { mode: "enabled" } }} />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "#rel", selectionStart: 4 } });

    const option = await screen.findByRole("option", { name: /Engineering.*Releases/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(textbox).toHaveAttribute("aria-controls");

    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(textbox).toHaveValue(`[#Engineering › Releases](urn:topic:${COMPOSER_TOPIC_UUID}) `);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(textbox).not.toHaveAttribute("aria-controls");
    expect(textbox).not.toHaveAttribute("aria-activedescendant");
  });

  it.each(["ArrowLeft", "ArrowRight", "Home", "End"])(
    "rechecks hash suggestions after %s",
    async (key) => {
      seedComposerWorkspaceStore();
      renderWithProviders(
        <MessageComposer onSend={vi.fn()} capabilities={{ mentions: { mode: "enabled" } }} />,
      );

      const textbox = screen.getByRole("textbox");
      if (!(textbox instanceof HTMLTextAreaElement)) {
        throw new Error("Expected textarea element");
      }
      fireEvent.change(textbox, { target: { value: "#eng", selectionStart: 4 } });
      const options = await screen.findAllByRole("option");
      expect(options[0]).toHaveTextContent("Engineering");

      textbox.setSelectionRange(0, 0);
      fireEvent.keyUp(textbox, { key });

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    },
  );

  it("opens mention popup for a standalone @ after supported delimiters", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");

    fireEvent.change(textbox, { target: { value: "@", selectionStart: 1 } });
    await screen.findByText("Alice Johnson");
    expect(useMentionSuggestStore.getState().visible).toBe(true);
    expect(useMentionSuggestStore.getState().query).toBe("");

    fireEvent.change(textbox, { target: { value: "hi @a", selectionStart: 5 } });
    await screen.findByText("Alice Johnson");
    expect(useMentionSuggestStore.getState().visible).toBe(true);
    expect(useMentionSuggestStore.getState().query).toBe("a");

    fireEvent.change(textbox, { target: { value: "hi,@a", selectionStart: 5 } });
    await screen.findByText("Alice Johnson");
    expect(useMentionSuggestStore.getState().visible).toBe(true);
    expect(useMentionSuggestStore.getState().query).toBe("a");

    fireEvent.change(textbox, { target: { value: "(@a", selectionStart: 3 } });
    await screen.findByText("Alice Johnson");
    expect(useMentionSuggestStore.getState().visible).toBe(true);
    expect(useMentionSuggestStore.getState().query).toBe("a");
  });

  it("does not open mention popup when @ is inside a word or email", () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "hello@a", selectionStart: 7 } });

    expect(useMentionSuggestStore.getState().visible).toBe(false);
    expect(useMentionSuggestStore.getState().query).toBe("");
    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
  });

  it("uses mention store state and inserts the first suggestion on Enter", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
      createWorkspaceUser({
        uuid: "user-bob-smith",
        displayName: "Bob Smith",
        username: "bob",
        email: "bob@example.com",
      }),
    ]);

    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@ali", selectionStart: 4 } });

    await screen.findByText("Alice Johnson");
    expect(useMentionSuggestStore.getState().query).toBe("ali");
    expect(useMentionSuggestStore.getState().visible).toBe(true);

    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("[Alice Johnson](urn:user:user-alice-johnson) ");
    expect(useMentionSuggestStore.getState().visible).toBe(false);
    expect(useMentionSuggestStore.getState().query).toBe("");

    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        "[Alice Johnson](urn:user:user-alice-johnson)",
        "",
        undefined,
      );
    });
  });

  it("supports arrow navigation before selecting a mention", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
      createWorkspaceUser({
        uuid: "user-alex-roe",
        displayName: "Alex Roe",
        username: "alex",
        email: "alex@example.com",
      }),
    ]);

    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@a", selectionStart: 2 } });

    await screen.findByText("Alice Johnson");
    await screen.findByText("Alex Roe");

    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("[Alex Roe](urn:user:user-alex-roe) ");
  });

  it("shows no-results popup when mention query has no matches", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@zzz", selectionStart: 4 } });

    expect(await screen.findByText("No results found")).toBeInTheDocument();
  });

  it("updates mention suggestions as the query changes", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
      createWorkspaceUser({
        uuid: "user-alex-roe",
        displayName: "Alex Roe",
        username: "alex",
        email: "alex@example.com",
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@a", selectionStart: 2 } });

    await screen.findByText("Alice Johnson");
    await screen.findByText("Alex Roe");

    fireEvent.change(textbox, { target: { value: "@ali", selectionStart: 4 } });

    await screen.findByText("Alice Johnson");
    await waitFor(() => {
      expect(screen.queryByText("Alex Roe")).not.toBeInTheDocument();
    });
    expect(useMentionSuggestStore.getState().query).toBe("ali");
  });

  it("renders a compact, scrollable mention dropdown", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@zzz", selectionStart: 4 } });

    const noResults = await screen.findByText("No results found");
    const dropdown = noResults.parentElement;
    expect(dropdown).not.toBeNull();
    expect(dropdown).toHaveClass("w-80");
    expect(dropdown).toHaveClass("max-h-48");
    expect(dropdown).toHaveClass("overflow-y-auto");
    expect(dropdown?.className).toContain("max-w-[calc(100vw-1rem)]");

    const inputRow = textbox.closest(".flex.min-h-10.items-stretch");
    expect(inputRow).not.toBeNull();
    expect(inputRow).toHaveClass("overflow-visible");
  });

  it("renders Workspace presence indicators in mention suggestions", async () => {
    const now = Math.floor(Date.now() / 1000);
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-presence-active",
        displayName: "Presence Active",
        username: "presence-active",
        email: "active@example.com",
        status: "active",
        lastPingAt: new Date(now * 1000).toISOString(),
      }),
      createWorkspaceUser({
        uuid: "user-presence-idle",
        displayName: "Presence Idle",
        username: "presence-idle",
        email: "idle@example.com",
        status: "idle",
        lastPingAt: new Date(now * 1000).toISOString(),
      }),
      createWorkspaceUser({
        uuid: "user-presence-dnd",
        displayName: "Presence Dnd",
        username: "presence-dnd",
        email: "dnd@example.com",
        status: "do_not_disturb",
        lastPingAt: new Date(now * 1000).toISOString(),
      }),
      createWorkspaceUser({
        uuid: "user-presence-offline",
        displayName: "Presence Offline",
        username: "presence-offline",
        email: "offline@example.com",
        status: "offline",
        lastPingAt: new Date(now * 1000).toISOString(),
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@presence", selectionStart: 9 } });

    await screen.findByText("Presence Active");
    expect(screen.getByText("Presence Idle")).toBeInTheDocument();
    expect(screen.getByText("Presence Dnd")).toBeInTheDocument();
    expect(screen.getByText("Presence Offline")).toBeInTheDocument();
    expect(screen.getByText("@presence-active")).toBeInTheDocument();

    expect(screen.getByRole("status", { name: /online/i })).toHaveAttribute(
      "data-presence",
      "active",
    );
    const awayIndicators = screen.getAllByRole("status", { name: /away/i });
    expect(awayIndicators).toHaveLength(2);
    awayIndicators.forEach((indicator) => {
      expect(indicator).toHaveAttribute("data-presence", "idle");
    });
    expect(screen.getByRole("status", { name: /offline/i })).toHaveAttribute(
      "data-presence",
      "offline",
    );
  });

  it("keeps legacy custom status emoji out of mention suggestions during cutover", async () => {
    useUsersStore.getState().upsertUser(
      createWorkspaceUser({
        uuid: "user-scam",
        displayName: "Scam User",
        username: "",
        email: "scam@example.com",
        statusEmoji: "scam",
        statusText: "",
      }),
    );

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@scam", selectionStart: 5 } });

    await screen.findByText("Scam User");
    expect(screen.queryByRole("img", { name: ":scam:" })).not.toBeInTheDocument();
    expect(screen.getByText("scam@example.com")).toBeInTheDocument();
    expect(screen.queryByText(":scam:")).not.toBeInTheDocument();
  });

  it("sends message on Enter when mention popup is open with no suggestions", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
    ]);

    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@zzz", selectionStart: 4 } });
    await screen.findByText("No results found");

    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("@zzz", "", undefined);
    });
    expect(useMentionSuggestStore.getState().visible).toBe(false);
  });

  it("does not wrap mention navigation at the list boundaries", async () => {
    useUsersStore.getState().upsertUsers([
      createWorkspaceUser({
        uuid: "user-alice-johnson",
        displayName: "Alice Johnson",
        username: "alice",
        email: "alice@example.com",
      }),
      createWorkspaceUser({
        uuid: "user-alex-roe",
        displayName: "Alex Roe",
        username: "alex",
        email: "alex@example.com",
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@a", selectionStart: 2 } });

    await screen.findByText("Alice Johnson");
    await screen.findByText("Alex Roe");

    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(textbox).toHaveValue("[Alex Roe](urn:user:user-alex-roe) ");
  });
});

describe("MessageComposer formatting shortcuts", () => {
  it("applies bold wrapper on mod+b", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }
    fireEvent.change(textbox, { target: { value: "hello" } });
    textbox.setSelectionRange(0, 5);

    fireEvent.keyDown(textbox, { key: "b", ctrlKey: true });

    await waitFor(() => {
      expect(textbox).toHaveValue("**hello**");
    });
  });

  it("applies strikethrough and code wrappers on mod+shift+x and mod+e", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }
    fireEvent.change(textbox, { target: { value: "sample" } });
    textbox.setSelectionRange(0, 6);
    fireEvent.keyDown(textbox, { key: "x", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(textbox).toHaveValue("~~sample~~");
    });

    textbox.setSelectionRange(2, 8);
    fireEvent.keyDown(textbox, { key: "e", ctrlKey: true });

    await waitFor(() => {
      expect(textbox).toHaveValue("~~`sample`~~");
    });
  });

  it("wraps current selection with spoiler marker from toolbar", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }
    fireEvent.change(textbox, { target: { value: "secret text" } });
    textbox.setSelectionRange(0, 6);

    fireEvent.click(screen.getByRole("button", { name: "Spoiler" }));

    await waitFor(() => {
      expect(textbox).toHaveValue("||secret|| text");
    });
  });

  it("wraps selected text with quote prefix from toolbar", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }
    fireEvent.change(textbox, { target: { value: "line one\nline two" } });
    textbox.setSelectionRange(0, textbox.value.length);

    fireEvent.click(screen.getByRole("button", { name: "Quote" }));

    await waitFor(() => {
      expect(textbox).toHaveValue("> line one\n> line two");
    });
  });

  it("inserts markdown link template from toolbar", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }
    fireEvent.change(textbox, { target: { value: "release notes" } });
    textbox.setSelectionRange(0, textbox.value.length);

    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() => {
      expect(textbox).toHaveValue("[release notes](https://)");
    });
  });
});

describe("MessageComposer preview mode", () => {
  it("renders the parent-provided full outgoing body", () => {
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        outgoingBodyOverride={"Reply from the first tab\n\nReply from the second tab"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByText("Reply from the first tab")).toBeInTheDocument();
    expect(within(preview).getByText("Reply from the second tab")).toBeInTheDocument();
  });

  it("hides preview tab when unsupported", () => {
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        capabilities={{
          preview: {
            mode: "unsupported",
            unsupportedText: "Preview is not connected.",
          },
        }}
      />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "**Hello** world" } });

    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("opens preview mode and keeps draft intact", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "**Hello** world" } });
    const previewButton = screen.getByRole("button", { name: "Preview" });
    expect(previewButton).toBeInTheDocument();
    fireEvent.click(previewButton);

    expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.getByRole("textbox")).toHaveValue("**Hello** world");
  });

  it("keeps preview mode available after switching back to write mode", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "**Hello** world" } });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.getByRole("textbox")).toHaveValue("**Hello** world");

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();
  });

  it("returns to write mode after sending from preview mode", async () => {
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "**Hello** world" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("**Hello** world", "", undefined);
      expect(screen.getByRole("textbox")).toHaveValue("");
    });
    expect(screen.queryByRole("region", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("shows empty preview state for empty draft", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.focus(textbox);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Nothing to preview yet")).toBeInTheDocument();
    });
  });

  it("renders Workspace preview with mentions during edit session", () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";

    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        onSubmitEdit={vi.fn().mockResolvedValue(undefined)}
        editSession={{
          messageId: 7,
          initialMarkdown: [
            `Hello [Alice Reed](urn:user:${userUuid})`,
            "",
            "> quoted line",
            "",
            "```ts",
            "const editPreview = true;",
            "```",
          ].join("\n"),
        }}
        resolveMention={(displayText) =>
          displayText === "Alice Reed"
            ? {
                userUuid,
                displayText: "Alice Reed",
              }
            : null
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByText("@Alice Reed")).toBeInTheDocument();
    expect(preview.querySelector("blockquote.workspace-message-quote")).not.toBeNull();
    expect(preview.querySelector('code[class*="language-ts"]')).not.toBeNull();
  });

  it("loads Workspace image URN previews during edit preview", async () => {
    const fileUuid = "22222222-2222-4222-8222-222222222222";
    const createObjectURLMock = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:composer-edit-workspace-preview");
    const revokeObjectURLMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const onLoadWorkspaceFilePreview = vi.fn().mockResolvedValue(
      new Blob(["image-bytes"], {
        type: "image/png",
      }),
    );

    try {
      const { unmount } = renderWithProviders(
        <MessageComposer
          onSend={vi.fn()}
          onSubmitEdit={vi.fn().mockResolvedValue(undefined)}
          editSession={{
            messageId: 7,
            initialMarkdown: `![screen.png](urn:image:${fileUuid}?name=screen.png&content_type=image%2Fpng)`,
          }}
          onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Preview" }));

      expect(onLoadWorkspaceFilePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "media",
          fileUuid,
          name: "screen.png",
          contentType: "image/png",
          mediaKind: "image",
        }),
        expect.any(AbortSignal),
      );
      await waitFor(() => {
        expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      });

      const preview = screen.getByRole("region", { name: "Preview" });
      const image = preview.querySelector<HTMLImageElement>(
        "img[data-workspace-file-preview='true']",
      );
      expect(image).not.toBeNull();
      expect(image).toHaveAttribute("src", "blob:composer-edit-workspace-preview");
      expect(preview.innerHTML).not.toContain(`urn:image:${fileUuid}`);

      unmount();
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:composer-edit-workspace-preview");
    } finally {
      createObjectURLMock.mockRestore();
      revokeObjectURLMock.mockRestore();
    }
  });

  it("renders attached local image files in preview mode with a blob URL", async () => {
    const createObjectURLMock = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:composer-preview-image");
    const revokeObjectURLMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    try {
      const { container } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
      const input = container.querySelector('input[type="file"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("Expected hidden file input");
      }

      const imageFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "preview.png", {
        type: "image/png",
      });
      fireEvent.change(input, { target: { files: [imageFile] } });
      fireEvent.click(screen.getByRole("button", { name: "Preview" }));

      const preview = screen.getByRole("region", { name: "Preview" });
      const thumbnail = await within(preview).findByRole("img", { name: "preview.png" });
      expect(thumbnail).toHaveAttribute("src", "blob:composer-preview-image");
      expect(within(preview).queryByText("preview.png")).not.toBeInTheDocument();
      expect(within(preview).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
      expect(screen.queryByText("Nothing to preview yet")).not.toBeInTheDocument();
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(createObjectURLMock).toHaveBeenCalledWith(imageFile);
    } finally {
      createObjectURLMock.mockRestore();
      revokeObjectURLMock.mockRestore();
    }
  });

  it("renders attached non-image files as preview plaques", () => {
    const { container } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }

    const file = new File([new Uint8Array(2048)], "brief.final.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByText("brief.final.pdf")).toBeInTheDocument();
    expect(within(preview).getByText("PDF")).toBeInTheDocument();
    expect(within(preview).getByText("2 KB")).toBeInTheDocument();
  });

  it("revokes attached image preview blob URLs when preview unmounts", async () => {
    const createObjectURLMock = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:composer-preview-unmount");
    const revokeObjectURLMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    try {
      const { container, unmount } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
      const input = container.querySelector('input[type="file"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("Expected hidden file input");
      }

      const imageFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "remove.png", {
        type: "image/png",
      });
      fireEvent.change(input, { target: { files: [imageFile] } });
      fireEvent.click(screen.getByRole("button", { name: "Preview" }));

      const preview = screen.getByRole("region", { name: "Preview" });
      await within(preview).findByRole("img", { name: "remove.png" });
      expect(within(preview).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
      unmount();

      await waitFor(() => {
        expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:composer-preview-unmount");
      });
    } finally {
      createObjectURLMock.mockRestore();
      revokeObjectURLMock.mockRestore();
    }
  });
});

describe("MessageComposer mode tabs", () => {
  it("animates toolbar row visibility with a subtle transition", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const toolbarRow = screen.getByTestId("composer-toolbar-row");
    expect(toolbarRow).toHaveClass("transition-[max-height,opacity,transform,padding]");
    expect(toolbarRow).toHaveClass("duration-200");
    expect(toolbarRow).toHaveClass("max-h-12");
    expect(toolbarRow).toHaveClass("opacity-100");
    expect(toolbarRow).toHaveClass("translate-y-0");
  });

  it("shows mode tabs row without requiring composer focus", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    expect(screen.getByRole("toolbar", { name: /message composer/i })).toBeInTheDocument();
  });

  it("uses larger icon size and clearer inactive color", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const writeButton = screen.getByRole("button", { name: "Write" });
    const previewButton = screen.getByRole("button", { name: "Preview" });
    const writeIcon = writeButton.querySelector("svg");
    const previewIcon = previewButton.querySelector("svg");

    expect(writeIcon).not.toBeNull();
    expect(previewIcon).not.toBeNull();
    expect(writeIcon).toHaveAttribute("width", String(TOOLBAR_ICON_SIZE));
    expect(previewIcon).toHaveAttribute("width", String(TOOLBAR_ICON_SIZE));
    expect(previewButton).toHaveClass("text-composer-icon");
    expect(writeButton).toHaveClass("text-icon-active");
    expect(writeButton).not.toHaveClass("text-icon-base");
  });

  it("adds bottom spacing between mode tabs row and input row", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const modeTabsRow = screen.getByTestId("composer-toolbar-row");

    expect(modeTabsRow).not.toBeNull();
    expect(modeTabsRow).toHaveClass("pb-1");
  });
});

describe("MessageComposer drag behavior", () => {
  it("ignores non-file dragover to avoid resetting text selection", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    const composer = screen.getByRole("form", { name: /message composer/i });

    fireEvent.dragOver(composer, {
      dataTransfer: { types: ["text/plain"] },
    });

    expect(composer.className).not.toContain("ring-2");
  });
});

describe("MessageComposer file attachments", () => {
  it("attaches selected files from file input and sends them", async () => {
    const onSend = vi.fn();
    const { container } = renderWithProviders(<MessageComposer onSend={onSend} />);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }
    const file = new File(["hello"], "spec.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("spec.txt")).toBeInTheDocument();
    });

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "message with file" } });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("message with file", "", [file]);
    });
  });

  it("attaches selected files when picker dispatches input event", async () => {
    const onSend = vi.fn();
    const { container } = renderWithProviders(<MessageComposer onSend={onSend} />);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }
    const file = new File(["hello"], "from-input-event.txt", { type: "text/plain" });
    fireEvent.input(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("from-input-event.txt")).toBeInTheDocument();
    });

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "message with input event file" } });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("message with input event file", "", [file]);
    });
  });

  it("deduplicates paired input/change events from a single picker selection", async () => {
    const onSend = vi.fn();
    const { container } = renderWithProviders(<MessageComposer onSend={onSend} />);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }

    const file = new File(["same"], "single-selection.txt", { type: "text/plain" });
    fireEvent.input(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getAllByText("single-selection.txt")).toHaveLength(1);
    });

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "message with single picker selection" } });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("message with single picker selection", "", [file]);
    });
  });

  it("allows selecting the same file in separate selections and sends both attachments", async () => {
    const onSend = vi.fn();
    const { container } = renderWithProviders(<MessageComposer onSend={onSend} />);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }

    const file = new File(["dup"], "duplicate.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getAllByText("duplicate.txt")).toHaveLength(2);
    });

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "message with duplicate files" } });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("message with duplicate files", "", [file, file]);
    });
  });

  it("attaches dropped files and includes them in send payload", async () => {
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const composer = screen.getByRole("form", { name: /message composer/i });
    const file = new File(["drop"], "dropped.png", { type: "image/png" });
    fireEvent.drop(composer, { dataTransfer: { types: ["Files"], files: [file] } });

    expect(screen.getByText("dropped.png")).toBeInTheDocument();

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "message from drop" } });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("message from drop", "", [file]);
    });
  });

  it("shows extension and size metadata for non-image attachments", async () => {
    const { container } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }

    const pdfFile = new File([new Uint8Array(2048)], "report.final.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText("report.final.pdf")).toBeInTheDocument();
    });
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
  });

  it("uses cancel-upload action for attached files during upload progress", async () => {
    const onCancelUpload = vi.fn();
    const { container } = renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        uploadProgress={{ completed: 0, total: 1, activeFileName: "uploading.txt" }}
        onCancelUpload={onCancelUpload}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }

    const file = new File(["payload"], "uploading.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTitle("uploading.txt")).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole("button", { name: /cancel upload/i });
    fireEvent.click(cancelButton);

    expect(onCancelUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("uploading.txt")).toBeInTheDocument();
  });

  it("renders image preview thumbnail for attached image files", async () => {
    const createObjectURLMock = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
    const revokeObjectURLMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    try {
      const { container, unmount } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
      const input = container.querySelector('input[type="file"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("Expected hidden file input");
      }

      const imageFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "preview.png", {
        type: "image/png",
      });
      fireEvent.change(input, { target: { files: [imageFile] } });

      const thumbnail = await screen.findByRole("img", { name: "preview.png" });
      expect(thumbnail).toHaveAttribute("src", "blob:test-image");
      expect(screen.getByText("preview.png")).toBeInTheDocument();
      expect(createObjectURLMock).toHaveBeenCalledWith(imageFile);

      unmount();
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:test-image");
    } finally {
      createObjectURLMock.mockRestore();
      revokeObjectURLMock.mockRestore();
    }
  });

  it("renders image preview thumbnail when pasting clipboard image with empty File.type", async () => {
    const createObjectURLMock = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test-paste-image");
    const revokeObjectURLMock = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    try {
      renderWithProviders(<MessageComposer onSend={vi.fn()} />);
      const textbox = screen.getByRole("textbox");
      const imageFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "image.png", {
        type: "",
      });

      fireEvent.paste(textbox, {
        clipboardData: {
          items: [
            {
              kind: "file",
              type: "image/png",
              getAsFile: () => imageFile,
            },
          ],
        },
      });

      const thumbnail = await screen.findByRole("img", { name: "image.png" });
      expect(thumbnail).toHaveAttribute("src", "blob:test-paste-image");
      expect(createObjectURLMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "image.png", type: "image/png" }),
      );
    } finally {
      createObjectURLMock.mockRestore();
      revokeObjectURLMock.mockRestore();
    }
  });
});

describe("MessageComposer upload progress", () => {
  it("renders upload progress indicator while composer files are uploading", () => {
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        uploadProgress={{ completed: 1, total: 3, activeFileName: "report.pdf" }}
      />,
    );

    expect(screen.getByText("Uploading files 1/3")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Uploading files progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(progress).toHaveAttribute("aria-valuemax", "3");
  });
});

describe("MessageComposer edit-last shortcut", () => {
  it("calls edit callback on ArrowUp when input is empty", () => {
    const onEditLastMessage = vi.fn();
    renderWithProviders(<MessageComposer onSend={vi.fn()} onEditLastMessage={onEditLastMessage} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.keyDown(textbox, { key: "ArrowUp" });

    expect(onEditLastMessage).toHaveBeenCalledTimes(1);
  });

  it("calls edit callback on ArrowUp when input contains only whitespace", () => {
    const onEditLastMessage = vi.fn();
    renderWithProviders(<MessageComposer onSend={vi.fn()} onEditLastMessage={onEditLastMessage} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: " \n\t " } });
    fireEvent.keyDown(textbox, { key: "ArrowUp" });

    expect(onEditLastMessage).toHaveBeenCalledTimes(1);
  });

  it("does not call edit callback on ArrowUp when input has text", () => {
    const onEditLastMessage = vi.fn();
    renderWithProviders(<MessageComposer onSend={vi.fn()} onEditLastMessage={onEditLastMessage} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "draft" } });
    fireEvent.keyDown(textbox, { key: "ArrowUp" });

    expect(onEditLastMessage).not.toHaveBeenCalled();
  });

  it("does not call edit callback on Shift+ArrowUp", () => {
    const onEditLastMessage = vi.fn();
    renderWithProviders(<MessageComposer onSend={vi.fn()} onEditLastMessage={onEditLastMessage} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.keyDown(textbox, { key: "ArrowUp", shiftKey: true });

    expect(onEditLastMessage).not.toHaveBeenCalled();
  });
});

describe("MessageComposer reply quote", () => {
  const sampleReplyQuote = {
    id: 101,
    content: "Original message",
    sender_full_name: "Alice",
    sender_id: 42,
    permalinkUrl: null,
  };

  it("focuses the textarea when replyQuote is set", () => {
    const { rerender } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    const textbox = screen.getByRole("textbox");
    expect(textbox).not.toHaveFocus();

    rerender(<MessageComposer onSend={vi.fn()} replyQuote={sampleReplyQuote} />);

    expect(textbox).toHaveFocus();
  });

  it("does not steal focus when replyQuote id is unchanged", () => {
    const { rerender } = renderWithProviders(
      <MessageComposer onSend={vi.fn()} replyQuote={sampleReplyQuote} />,
    );
    const textbox = screen.getByRole("textbox");
    textbox.blur();
    expect(textbox).not.toHaveFocus();

    rerender(<MessageComposer onSend={vi.fn()} replyQuote={sampleReplyQuote} />);

    expect(textbox).not.toHaveFocus();
  });

  it("renders leading reply content inside the regular composer card", () => {
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        leadingContent={<div data-testid="workspace-reply-tabs">Reply tabs</div>}
      />,
    );

    const composer = screen.getByRole("form", { name: /message composer/i });
    expect(composer).toContainElement(screen.getByTestId("workspace-reply-tabs"));
  });

  it("keeps the clear-reply control on the tabs row when multi-reply tabs are present", () => {
    const onClearReply = vi.fn();
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        replyQuote={sampleReplyQuote}
        onClearReply={onClearReply}
        leadingContent={<div data-testid="workspace-reply-tabs">Reply tabs</div>}
      />,
    );

    const replyTabs = screen.getByTestId("workspace-reply-tabs");
    const clearReply = screen.getByRole("button", { name: /^cancel$/i });
    const replyQuoteLabel = screen.getByText("Reply: Alice");

    expect(
      clearReply.compareDocumentPosition(replyQuoteLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(replyTabs.compareDocumentPosition(clearReply) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    // Tabs scroll in their own flex slot; the global dismiss stays a sibling (shrink-0).
    const tabsSlot = replyTabs.parentElement;
    const tabsRow = tabsSlot?.parentElement;
    expect(tabsSlot).not.toBeNull();
    expect(tabsRow).not.toBeNull();
    expect(tabsSlot?.className).toMatch(/min-w-0/);
    expect(tabsSlot?.className).toMatch(/flex-1/);
    expect(tabsRow).toContainElement(clearReply);
    expect(clearReply.className).toMatch(/shrink-0/);
    expect(tabsSlot).not.toContainElement(clearReply);

    fireEvent.click(clearReply);
    expect(onClearReply).toHaveBeenCalledTimes(1);
  });

  it("keeps the clear-reply control on the quote row for a single reply", () => {
    const onClearReply = vi.fn();
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        replyQuote={sampleReplyQuote}
        onClearReply={onClearReply}
      />,
    );

    const clearReply = screen.getByRole("button", { name: /^cancel$/i });
    const replyQuoteLabel = screen.getByText("Reply: Alice");
    const quoteRow = replyQuoteLabel.closest("div.flex");
    expect(quoteRow).toContainElement(clearReply);

    fireEvent.click(clearReply);
    expect(onClearReply).toHaveBeenCalledTimes(1);
  });
});

describe("MessageComposer focus key", () => {
  it("focuses the textarea when focusKey changes without reacting to draft updates", () => {
    const { rerender } = renderWithProviders(
      <MessageComposer onSend={vi.fn()} focusKey="reply-a" initialValue="answer A" />,
    );
    const textbox = screen.getByRole("textbox");
    textbox.blur();
    expect(textbox).not.toHaveFocus();

    rerender(<MessageComposer onSend={vi.fn()} focusKey="reply-a" initialValue="answer B" />);
    expect(textbox).not.toHaveFocus();

    rerender(<MessageComposer onSend={vi.fn()} focusKey="reply-b" initialValue="answer B" />);
    expect(textbox).toHaveFocus();
  });

  it("keeps the legacy composer path unchanged when focusKey is omitted", () => {
    const { rerender } = renderWithProviders(
      <MessageComposer onSend={vi.fn()} initialValue="answer A" />,
    );
    const textbox = screen.getByRole("textbox");
    textbox.blur();

    rerender(<MessageComposer onSend={vi.fn()} initialValue="answer B" />);

    expect(textbox).not.toHaveFocus();
  });
});

describe("MessageComposer draft session", () => {
  it("keeps attached files when the draft session changes to a reply tab", async () => {
    const onSend = vi.fn();
    const { container, rerender } = renderWithProviders(
      <MessageComposer
        onSend={onSend}
        draftSessionKey="workspace-chat:text"
        initialValue="draft before reply"
      />,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected hidden file input");
    }
    const file = new File(["attachment"], "reply-attachment.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("reply-attachment.txt")).toBeInTheDocument();
    });

    rerender(
      <MessageComposer
        onSend={onSend}
        draftSessionKey="workspace-chat:reply:tab-a"
        initialValue="draft before reply"
      />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("draft before reply");
    expect(screen.getByText("reply-attachment.txt")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("draft before reply", "", [file]);
    });
  });

  it("applies the initial value when the draft session changes", () => {
    const { rerender } = renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        draftSessionKey="chat-a"
        initialValue="saved draft for chat A"
      />,
    );
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "new text in chat A" } });

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        draftSessionKey="chat-b"
        initialValue="saved draft for chat B"
      />,
    );

    expect(textbox).toHaveValue("saved draft for chat B");
  });

  it("does not overwrite local input when initialValue arrives late in the same draft session", () => {
    const { rerender } = renderWithProviders(
      <MessageComposer onSend={vi.fn()} draftSessionKey="chat-a" initialValue="" />,
    );
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "local input" } });

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        draftSessionKey="chat-a"
        initialValue="late persisted draft"
      />,
    );

    expect(textbox).toHaveValue("local input");
  });

  it("keeps the legacy initialValue reset behavior when draftSessionKey is omitted", () => {
    const { rerender } = renderWithProviders(
      <MessageComposer onSend={vi.fn()} initialValue="initial draft" />,
    );
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "local input" } });

    rerender(<MessageComposer onSend={vi.fn()} initialValue="updated draft" />);

    expect(textbox).toHaveValue("updated draft");
  });
});

describe("MessageComposer edit session", () => {
  it("submits edited content and restores previous draft after session closes", async () => {
    const onSubmitEdit = vi.fn().mockResolvedValue(undefined);
    const onValueChange = vi.fn();
    const onCancelEdit = vi.fn();
    const { rerender } = renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        initialValue="draft before edit"
        onValueChange={onValueChange}
        onSubmitEdit={onSubmitEdit}
        onCancelEdit={onCancelEdit}
      />,
    );

    const textbox = screen.getByRole("textbox");
    expect(textbox).toHaveValue("draft before edit");

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        initialValue="draft before edit"
        onValueChange={onValueChange}
        onSubmitEdit={onSubmitEdit}
        onCancelEdit={onCancelEdit}
        editSession={{ messageId: 42, initialMarkdown: "message to edit" }}
      />,
    );

    expect(textbox).toHaveValue("message to edit");
    fireEvent.change(textbox, { target: { value: "edited message body" } });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSubmitEdit).toHaveBeenCalledWith(42, "edited message body");
    });
    expect(onValueChange).not.toHaveBeenCalled();

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        initialValue="draft before edit"
        onValueChange={onValueChange}
        onSubmitEdit={onSubmitEdit}
        onCancelEdit={onCancelEdit}
      />,
    );

    expect(textbox).toHaveValue("draft before edit");
  });

  it("cancels edit session on Escape and restores previous draft", () => {
    const onCancelEdit = vi.fn();
    const { rerender } = renderWithProviders(
      <MessageComposer onSend={vi.fn()} initialValue="draft text" onCancelEdit={onCancelEdit} />,
    );

    const textbox = screen.getByRole("textbox");
    rerender(
      <MessageComposer
        onSend={vi.fn()}
        initialValue="draft text"
        onCancelEdit={onCancelEdit}
        editSession={{ messageId: 7, initialMarkdown: "server markdown" }}
      />,
    );

    expect(textbox).toHaveValue("server markdown");
    fireEvent.keyDown(textbox, { key: "Escape" });
    expect(onCancelEdit).toHaveBeenCalledTimes(1);

    rerender(
      <MessageComposer onSend={vi.fn()} initialValue="draft text" onCancelEdit={onCancelEdit} />,
    );
    expect(textbox).toHaveValue("draft text");
  });

  it("restores original draft after switching edit target within one edit flow", () => {
    const onCancelEdit = vi.fn();
    const { rerender } = renderWithProviders(
      <MessageComposer onSend={vi.fn()} initialValue="draft text" onCancelEdit={onCancelEdit} />,
    );

    const textbox = screen.getByRole("textbox");
    expect(textbox).toHaveValue("draft text");

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        initialValue="draft text"
        onCancelEdit={onCancelEdit}
        editSession={{ messageId: 7, initialMarkdown: "message A" }}
      />,
    );
    expect(textbox).toHaveValue("message A");

    fireEvent.change(textbox, { target: { value: "edited message A" } });

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        initialValue="draft text"
        onCancelEdit={onCancelEdit}
        editSession={{ messageId: 8, initialMarkdown: "message B" }}
      />,
    );
    expect(textbox).toHaveValue("message B");

    fireEvent.keyDown(textbox, { key: "Escape" });
    expect(onCancelEdit).toHaveBeenCalledTimes(1);

    rerender(
      <MessageComposer onSend={vi.fn()} initialValue="draft text" onCancelEdit={onCancelEdit} />,
    );
    expect(textbox).toHaveValue("draft text");
  });

  it("restores the current draft session after edit mode ignores a late initial value", () => {
    const { rerender } = renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        draftSessionKey="chat-a"
        initialValue="draft before edit"
      />,
    );
    const textbox = screen.getByRole("textbox");

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        draftSessionKey="chat-a"
        initialValue="late persisted draft"
        editSession={{ messageId: 7, initialMarkdown: "message to edit" }}
      />,
    );
    expect(textbox).toHaveValue("message to edit");

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        draftSessionKey="chat-a"
        initialValue="late persisted draft"
      />,
    );

    expect(textbox).toHaveValue("draft before edit");
  });

  it("edits a restored Workspace reply through the active tab body", async () => {
    const onSubmitEdit = vi.fn().mockResolvedValue(undefined);
    const onValueChange = vi.fn();
    const replyQuote = {
      id: "reply-a",
      content: "quoted message",
      sender_full_name: "Alice",
      sender_uuid: "11111111-1111-4111-8111-111111111111",
      quoteFormat: "workspace" as const,
      permalinkUrl: null,
    };
    const { rerender } = renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        onSubmitEdit={onSubmitEdit}
        onValueChange={onValueChange}
        replyQuote={replyQuote}
        outgoingBodyOverride="full restored body A"
        editSession={{
          messageId: 42,
          initialMarkdown: "answer A",
          preserveWorkspaceReplyContext: true,
          sessionKey: "reply-a",
        }}
      />,
    );

    const textbox = screen.getByRole("textbox");
    expect(textbox).toHaveValue("answer A");
    expect(screen.getByText("Reply: Alice")).toBeInTheDocument();

    fireEvent.change(textbox, { target: { value: "changed answer A" } });
    expect(onValueChange).toHaveBeenLastCalledWith("changed answer A");
    fireEvent.keyDown(textbox, { key: "Enter" });
    await waitFor(() => {
      expect(onSubmitEdit).toHaveBeenCalledWith(42, "full restored body A");
    });

    rerender(
      <MessageComposer
        onSend={vi.fn()}
        onSubmitEdit={onSubmitEdit}
        onValueChange={onValueChange}
        replyQuote={replyQuote}
        outgoingBodyOverride="full restored body B"
        editSession={{
          messageId: 42,
          initialMarkdown: "answer B",
          preserveWorkspaceReplyContext: true,
          sessionKey: "reply-b",
        }}
      />,
    );

    expect(textbox).toHaveValue("answer B");
  });

  it("places the edit notice above restored reply tabs and quote", () => {
    const replyQuote = {
      id: "reply-a",
      content: "quoted message",
      sender_full_name: "Alice",
      sender_uuid: "11111111-1111-4111-8111-111111111111",
      quoteFormat: "workspace" as const,
      permalinkUrl: null,
    };
    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        replyQuote={replyQuote}
        leadingContent={<div data-testid="reply-tabs">Reply tabs</div>}
        outgoingBodyOverride="full restored body"
        editSession={{
          messageId: 42,
          initialMarkdown: "answer",
          preserveWorkspaceReplyContext: true,
          sessionKey: "reply-a",
        }}
      />,
    );

    const editNotice = screen.getByText("Edit message");
    const replyTabs = screen.getByTestId("reply-tabs");
    const replyQuoteLabel = screen.getByText("Reply: Alice");
    expect(editNotice.compareDocumentPosition(replyTabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      replyTabs.compareDocumentPosition(replyQuoteLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe("MessageComposer send shortcuts", () => {
  it("renders icon-only send button while preserving accessible name", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const sendButton = screen.getByRole("button", { name: /write a message/i });
    const sendIcon = sendButton.querySelector("svg");
    expect(sendButton).toBeInTheDocument();
    expect(sendButton).not.toHaveTextContent(/write a message/i);
    expect(sendButton).toHaveClass("text-on-accent");
    expect(sendIcon).not.toBeNull();
    expect(sendIcon).toHaveClass("text-on-accent");
  });

  it("uses compact send button sizing aligned with one-line input", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    const paddedShell = textbox.closest(".p-3");
    const sendButton = screen.getByRole("button", { name: /write a message/i });

    expect(paddedShell).not.toBeNull();
    expect(sendButton).toHaveClass("h-9");
    expect(sendButton).toHaveClass("w-9");
    expect(sendButton).toHaveClass("self-center");
    expect(sendButton).toHaveClass("rounded-r-xl");
  });

  it("sends message on Enter", async () => {
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "hello" } });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("hello", "", undefined);
    });
  });

  it("does not send message on Shift+Enter", () => {
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "hello" } });
    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("continues bulleted list on Shift+Enter", () => {
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }

    fireEvent.change(textbox, { target: { value: "- item" } });
    textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("- item\n- ");
  });

  it("continues numbered list on Shift+Enter", () => {
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }

    fireEvent.change(textbox, { target: { value: "1. item" } });
    textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("1. item\n2. ");
  });

  it("exits list continuation on empty bullet marker line", () => {
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }

    fireEvent.change(textbox, { target: { value: "- " } });
    textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("");
  });
});

describe("MessageComposer emoji picker behavior", () => {
  it("centers emoji trigger vertically in composer row", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const emojiButton = screen.getByRole("button", { name: /emoji/i });
    const emojiContainer = emojiButton.parentElement;

    expect(emojiContainer).not.toBeNull();
    expect(emojiContainer).toHaveClass("h-9");
    expect(emojiContainer).toHaveClass("w-9");
    expect(emojiContainer).toHaveClass("self-center");
    expect(emojiButton).toHaveClass("rounded-l-xl");
  });

  it("returns focus to composer after emoji pick", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    if (!(textbox instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea element");
    }
    textbox.focus();
    expect(textbox).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: /emoji/i }));
    const pickEmojiButton = await screen.findByRole("button", { name: /pick emoji/i });
    pickEmojiButton.focus();
    expect(pickEmojiButton).toHaveFocus();

    fireEvent.click(pickEmojiButton);

    await waitFor(() => {
      expect(textbox).toHaveValue("😀");
    });
    expect(textbox).toHaveFocus();
  });

  it("passes composer emoji picker class for themed scrollbar styling", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /emoji/i }));
    await screen.findByRole("button", { name: /pick emoji/i });

    const props = emojiPickerMock.mock.calls.at(-1)?.[0] as
      | { className?: string; emojiStyle?: string }
      | undefined;
    expect(props?.className).toContain("composer-emoji-picker");
    expect(props?.emojiStyle).toBe("native");
  });
});

describe("MessageComposer WebView keyboard adaptation", () => {
  it("adds bottom inset when virtual keyboard is open in WebView", () => {
    isWebViewMock.mockReturnValue(true);
    useViewportKeyboardMock.mockReturnValue({ isOpen: true, keyboardHeight: 256 });

    const { container } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    const composer = container.querySelector('[data-focus-zone="composer"]');

    expect(composer).not.toBeNull();
    expect(composer).toHaveStyle({ paddingBottom: "256px" });
  });

  it("does not add keyboard inset outside WebView", () => {
    isWebViewMock.mockReturnValue(false);
    useViewportKeyboardMock.mockReturnValue({ isOpen: true, keyboardHeight: 256 });

    const { container } = renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    const composer = container.querySelector('[data-focus-zone="composer"]');

    expect(composer).not.toBeNull();
    expect(composer).not.toHaveStyle({ paddingBottom: "256px" });
  });
});

describe("computeFloatingPickerPosition", () => {
  it("keeps popup inside viewport when anchor is near right edge", () => {
    const position = computeFloatingPickerPosition({
      anchorRect: { left: 980, top: 700, bottom: 736, width: 40 },
      pickerWidth: 320,
      pickerHeight: 360,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(position.left + position.width).toBeLessThanOrEqual(1016);
    expect(position.left).toBeGreaterThanOrEqual(8);
  });

  it("falls back below anchor when there is not enough room above", () => {
    const position = computeFloatingPickerPosition({
      anchorRect: { left: 120, top: 20, bottom: 56, width: 40 },
      pickerWidth: 320,
      pickerHeight: 360,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(position.top).toBeGreaterThan(56);
  });
});

describe("MessageComposer AI context wiring", () => {
  it("renders attach trigger inside formatting toolbar", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const toolbar = screen.getByRole("toolbar", { name: /message composer/i });
    const attachButton = screen.getByRole("button", { name: /attach file/i });

    expect(toolbar).toContainElement(attachButton);
  });

  it("does not render schedule trigger inside formatting toolbar", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const toolbar = screen.getByRole("toolbar", { name: /message composer/i });

    expect(
      within(toolbar).queryByRole("button", { name: /message menu/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render stickers trigger inside formatting toolbar", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const toolbar = screen.getByRole("toolbar", { name: /message composer/i });
    const stickersButton = within(toolbar).queryByRole("button", { name: /stickers/i });

    expect(stickersButton).not.toBeInTheDocument();
  });

  it("renders create call link trigger inside formatting toolbar", () => {
    const onCreateCallLink = vi.fn(() => "https://meet.jit.si/test-room");
    renderWithProviders(<MessageComposer onSend={vi.fn()} onCreateCallLink={onCreateCallLink} />);
    focusComposerInput();

    const toolbar = screen.getByRole("toolbar", { name: /message composer/i });
    const createCallLinkButton = screen.getByRole("button", { name: /create call link/i });

    expect(toolbar).toContainElement(createCallLinkButton);
  });

  it("inserts generated call link into composer draft", () => {
    const onCreateCallLink = vi.fn(() => "https://meet.jit.si/test-room");
    renderWithProviders(<MessageComposer onSend={vi.fn()} onCreateCallLink={onCreateCallLink} />);

    const textbox = focusComposerInput();
    fireEvent.change(textbox, { target: { value: "Agenda" } });

    fireEvent.click(screen.getByRole("button", { name: /create call link/i }));

    expect(onCreateCallLink).toHaveBeenCalledTimes(1);
    expect(textbox).toHaveValue("Agenda\nhttps://meet.jit.si/test-room");
  });

  it("orders toolbar buttons into logical formatting groups", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const toolbar = screen.getByRole("toolbar", { name: /message composer/i });
    const labels = within(toolbar)
      .getAllByRole("button")
      .map((button) => {
        const ariaLabel = button.getAttribute("aria-label");
        if (ariaLabel != null && ariaLabel.length > 0) {
          return ariaLabel;
        }
        return button.textContent?.replace(/\s+/g, " ").trim() ?? "";
      });

    expect(labels).toEqual([
      "Bold",
      "Italic",
      "Strikethrough",
      "Quote",
      "Bulleted list",
      "Numbered list",
      "Code",
      "Spoiler",
      "Code block",
      "Link",
      "Attach file",
      "Saved snippets",
      "AI",
    ]);
  });

  it("uses a unified media picker with emoji and stickers tabs", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /emoji/i }));

    const picker = screen.getByTestId("composer-media-picker");
    const tabs = within(picker).getAllByRole("tab");
    const emojiTab = tabs.find((tab) => /emoji/i.test(tab.getAttribute("aria-label") ?? ""));
    const stickersTab = tabs.find((tab) => /stickers/i.test(tab.getAttribute("aria-label") ?? ""));
    if (emojiTab == null || stickersTab == null) {
      throw new Error("Expected emoji and stickers tabs in composer media picker");
    }

    expect(emojiTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(stickersTab);

    expect(stickersTab).toHaveAttribute("aria-selected", "true");
    expect(within(picker).getByTestId("sticker-picker-mock")).toBeInTheDocument();
  });

  it("renders AI tools trigger inside formatting toolbar", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const toolbar = screen.getByRole("toolbar", { name: /message composer/i });
    const aiButton = screen.getByRole("button", { name: "AI" });

    expect(toolbar).toContainElement(aiButton);
  });

  it("closes AI menu when clicking outside", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByTestId("composer-ai-unavailable-popover")).toBeInTheDocument();

    const backdrop = screen.getByTestId("composer-ai-menu-backdrop");
    fireEvent.click(backdrop);

    expect(screen.queryByTestId("composer-ai-menu-backdrop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("composer-ai-unavailable-popover")).not.toBeInTheDocument();
  });

  it("shows temporary unavailable message when AI trigger is clicked", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    expect(
      screen.getByText("AI features are temporarily unavailable in your organization."),
    ).toBeInTheDocument();
  });

  it("toggles AI unavailable popover on repeated AI trigger click", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByTestId("composer-ai-unavailable-popover")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.queryByTestId("composer-ai-unavailable-popover")).not.toBeInTheDocument();
  });

  it("closes other popovers when opening AI unavailable popover", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    fireEvent.click(screen.getByRole("button", { name: /saved snippets/i }));
    expect(screen.getByTestId("composer-saved-snippets-picker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.queryByTestId("composer-saved-snippets-picker")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /emoji/i }));
    expect(screen.getByTestId("composer-media-picker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.queryByTestId("composer-media-picker")).not.toBeInTheDocument();
  });
});
