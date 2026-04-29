import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { useMentionSuggestStore } from "~/features/mention-suggest/mention-suggest.model";
import type * as ZulipMessagesApi from "~/shared/api/zulip-messages";
import { resetRealmEmojisCacheForTests } from "~/shared/lib/realm-emojis-cache";
import { createUser } from "~/test/factories";
import { renderWithProviders } from "~/test/render";
import { computeFloatingPickerPosition } from "./message-composer-picker-position.lib";
import { MessageComposer } from "./message-composer.ui";

const isWebViewMock = vi.fn(() => false);
const useViewportKeyboardMock = vi.fn(() => ({ isOpen: false, keyboardHeight: 0 }));
const renderMessageContentMock = vi.hoisted(() => vi.fn());
const fetchSavedSnippetsMock = vi.hoisted(() => vi.fn());
const createSavedSnippetMock = vi.hoisted(() => vi.fn());
const emojiPickerMock = vi.hoisted(() => vi.fn());
const fetchRealmEmojisMock = vi.hoisted(() => vi.fn());

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

vi.mock("~/shared/api/zulip-messages", async () => {
  const actual = await vi.importActual<typeof ZulipMessagesApi>("~/shared/api/zulip-messages");
  return {
    ...actual,
    renderMessageContent: (...args: unknown[]) => renderMessageContentMock(...args),
    fetchSavedSnippets: (...args: unknown[]) => fetchSavedSnippetsMock(...args),
    createSavedSnippet: (...args: unknown[]) => createSavedSnippetMock(...args),
  };
});

vi.mock("~/shared/api/zulip", async () => {
  const actual = await vi.importActual("~/shared/api/zulip");
  return {
    ...actual,
    fetchRealmEmojis: (...args: unknown[]) => fetchRealmEmojisMock(...args),
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

const aiActionMenuMock = vi.fn();

vi.mock("~/features/ai-reply/ai-reply.ui", () => ({
  AiComposerButton: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      AI
    </button>
  ),
  AiActionMenu: (props: unknown) => {
    aiActionMenuMock(props);
    return null;
  },
  SmartReplySuggestions: () => null,
}));

vi.mock("~/features/sticker-picker/sticker-picker.ui", () => ({
  StickerPicker: () => <div data-testid="sticker-picker-mock">Sticker picker</div>,
}));

vi.mock("~/entities/sticker/sticker.api", () => ({
  buildStickerMarkdown: () => ":sticker:",
}));

afterEach(() => {
  useUsersStore.getState().clear();
  useMentionSuggestStore.getState().clear();
  aiActionMenuMock.mockReset();
  isWebViewMock.mockReset();
  isWebViewMock.mockReturnValue(false);
  useViewportKeyboardMock.mockReset();
  useViewportKeyboardMock.mockReturnValue({ isOpen: false, keyboardHeight: 0 });
  renderMessageContentMock.mockReset();
  renderMessageContentMock.mockResolvedValue("<p>preview</p>");
  fetchSavedSnippetsMock.mockReset();
  fetchSavedSnippetsMock.mockResolvedValue([]);
  createSavedSnippetMock.mockReset();
  createSavedSnippetMock.mockResolvedValue(1);
  emojiPickerMock.mockReset();
  fetchRealmEmojisMock.mockReset();
  fetchRealmEmojisMock.mockResolvedValue([]);
});

beforeEach(() => {
  resetRealmEmojisCacheForTests();
});

const focusComposerInput = () => {
  const textbox = screen.getByRole("textbox");
  fireEvent.focus(textbox);
  return textbox;
};

describe("MessageComposer async send behavior", () => {
  it("clears the composer as soon as send starts, before onSend resolves", async () => {
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

    expect(onSend).toHaveBeenCalledWith("Hello world", "general", undefined);
    await waitFor(() => {
      expect(textbox).toHaveValue("");
    });

    resolveSend();
  });

  it("leaves the composer empty when async onSend rejects", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("send failed"));

    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "Draft text" } });
    fireEvent.click(screen.getByRole("button", { name: /write a message/i }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Draft text", "general", undefined);
    });

    expect(textbox).toHaveValue("");
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
  it("queues message for later and sends it when scheduled time arrives", async () => {
    vi.useFakeTimers();
    try {
      const onSend = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<MessageComposer onSend={onSend} />);

      const textbox = screen.getByRole("textbox");
      fireEvent.change(textbox, { target: { value: "Delayed update" } });

      fireEvent.click(screen.getByRole("button", { name: /message menu/i }));
      fireEvent.click(screen.getByRole("button", { name: "10m" }));

      expect(onSend).not.toHaveBeenCalled();
      expect(textbox).toHaveValue("");
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1000);
      expect(onSend).toHaveBeenCalledWith("Delayed update", "general", undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows cancelling a scheduled message before it is sent", () => {
    vi.useFakeTimers();
    try {
      const onSend = vi.fn().mockResolvedValue(undefined);
      renderWithProviders(<MessageComposer onSend={onSend} />);

      const textbox = screen.getByRole("textbox");
      fireEvent.change(textbox, { target: { value: "Cancel me" } });

      fireEvent.click(screen.getByRole("button", { name: /message menu/i }));
      fireEvent.click(screen.getByRole("button", { name: "10m" }));

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(onSend).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MessageComposer saved snippets", () => {
  it("loads saved snippets and inserts selected content into composer", async () => {
    fetchSavedSnippetsMock.mockResolvedValue([
      {
        id: 101,
        title: "Incident template",
        content: "Status update:\n- Impact\n- Mitigation",
        date_created: 1710000000,
      },
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.focus(textbox);
    fireEvent.click(screen.getByRole("button", { name: /saved snippets/i }));

    await screen.findByRole("button", { name: "Incident template" });
    fireEvent.click(screen.getByRole("button", { name: "Incident template" }));

    expect(textbox).toHaveValue("Status update:\n- Impact\n- Mitigation");
    expect(fetchSavedSnippetsMock).toHaveBeenCalledTimes(1);
  });

  it("filters snippets and shows no matching state", async () => {
    fetchSavedSnippetsMock.mockResolvedValue([
      { id: 101, title: "Incident template", content: "Status update", date_created: 1710000000 },
      { id: 102, title: "Release notes", content: "## Changes", date_created: 1710000001 },
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.click(screen.getByRole("button", { name: /saved snippets/i }));

    const filterInput = await screen.findByRole("textbox", { name: /filter snippets/i });
    fireEvent.change(filterInput, { target: { value: "does-not-exist" } });

    expect(screen.getByText("No matching results")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create new saved snippet/i })).toBeInTheDocument();
  });

  it("creates a saved snippet from the current draft", async () => {
    fetchSavedSnippetsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 333,
        title: "Bug report",
        content: "Current draft body",
        date_created: 1710000002,
      },
    ]);

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
      expect(createSavedSnippetMock).toHaveBeenCalledWith({
        title: "Bug report",
        content: "Current draft body",
      });
    });

    await waitFor(() => {
      expect(fetchSavedSnippetsMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("button", { name: "Bug report" })).toBeInTheDocument();
  });
});

describe("MessageComposer mention suggestions", () => {
  it("opens mention popup for a standalone @ after supported delimiters", async () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1001, full_name: "Alice Johnson", email: "alice@example.com" }),
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
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1001, full_name: "Alice Johnson", email: "alice@example.com" }),
      ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "hello@a", selectionStart: 7 } });

    expect(useMentionSuggestStore.getState().visible).toBe(false);
    expect(useMentionSuggestStore.getState().query).toBe("");
    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();
  });

  it("uses mention store state and inserts the first suggestion on Enter", async () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 1001, full_name: "Alice Johnson", email: "alice@example.com" }),
        createUser({ user_id: 1002, full_name: "Bob Smith", email: "bob@example.com" }),
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
    expect(textbox).toHaveValue("@**Alice Johnson** ");
    expect(useMentionSuggestStore.getState().visible).toBe(false);
    expect(useMentionSuggestStore.getState().query).toBe("");
  });

  it("supports arrow navigation before selecting a mention", async () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 2001, full_name: "Alice Johnson", email: "alice@example.com" }),
        createUser({ user_id: 2002, full_name: "Alex Roe", email: "alex@example.com" }),
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
    expect(textbox).toHaveValue("@**Alex Roe** ");
  });

  it("shows no-results popup when mention query has no matches", async () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 3001, full_name: "Alice Johnson", email: "alice@example.com" }),
      ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@zzz", selectionStart: 4 } });

    expect(await screen.findByText("No results found")).toBeInTheDocument();
  });

  it("updates mention suggestions as the query changes", async () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 2001, full_name: "Alice Johnson", email: "alice@example.com" }),
        createUser({ user_id: 2002, full_name: "Alex Roe", email: "alex@example.com" }),
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
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 3001, full_name: "Alice Johnson", email: "alice@example.com" }),
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

  it("renders presence indicators in mention suggestions", async () => {
    const now = Math.floor(Date.now() / 1000);
    useUsersStore.getState().mergeUsers([
      createUser({
        user_id: 5001,
        full_name: "Alice Johnson",
        email: "alice@example.com",
        presence: { status: "active", timestamp: now },
      }),
      createUser({
        user_id: 5002,
        full_name: "Alex Roe",
        email: "alex@example.com",
        presence: { status: "idle", timestamp: now },
      }),
    ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@a", selectionStart: 2 } });

    await screen.findByText("Alice Johnson");
    expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /away/i })).toBeInTheDocument();
  });

  it("sends message on Enter when mention popup is open with no suggestions", async () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 3001, full_name: "Alice Johnson", email: "alice@example.com" }),
      ]);

    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@zzz", selectionStart: 4 } });
    await screen.findByText("No results found");

    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("@zzz", "general", undefined);
    });
    expect(useMentionSuggestStore.getState().visible).toBe(false);
  });

  it("does not wrap mention navigation at the list boundaries", async () => {
    useUsersStore
      .getState()
      .mergeUsers([
        createUser({ user_id: 4001, full_name: "Alice Johnson", email: "alice@example.com" }),
        createUser({ user_id: 4002, full_name: "Alex Roe", email: "alex@example.com" }),
      ]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "@a", selectionStart: 2 } });

    await screen.findByText("Alice Johnson");
    await screen.findByText("Alex Roe");

    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "ArrowDown" });
    fireEvent.keyDown(textbox, { key: "Enter" });

    expect(textbox).toHaveValue("@**Alex Roe** ");
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
  it("renders markdown preview via Zulip render API and keeps draft intact", async () => {
    renderMessageContentMock.mockResolvedValue("<p><strong>Hello</strong> world</p>");
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "**Hello** world" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(renderMessageContentMock).toHaveBeenCalledWith("**Hello** world");
      expect(screen.getByRole("region", { name: "Preview" })).toHaveTextContent("Hello world");
    });

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.getByRole("textbox")).toHaveValue("**Hello** world");
  });

  it("does not call preview API for empty draft", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.focus(textbox);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(renderMessageContentMock).not.toHaveBeenCalled();
      expect(screen.getByText("Nothing to preview yet")).toBeInTheDocument();
    });
  });

  it("falls back to local markdown rendering when preview API fails", async () => {
    renderMessageContentMock.mockRejectedValue(new Error("preview unavailable"));
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "**Fallback works**" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      const previewRegion = screen.getByRole("region", { name: "Preview" });
      const strong = previewRegion.querySelector("strong");
      expect(strong).not.toBeNull();
      expect(strong).toHaveTextContent("Fallback works");
    });
  });

  it("adds syntax-highlight classes to code blocks in preview", async () => {
    renderMessageContentMock.mockResolvedValue(
      '<pre><code class="language-javascript">const value = 1;</code></pre>',
    );
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "```javascript\\nconst value = 1;\\n```" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      const previewRegion = screen.getByRole("region", { name: "Preview" });
      const highlightedCode = previewRegion.querySelector("code.hljs");
      expect(highlightedCode).not.toBeNull();
      expect(highlightedCode?.querySelector(".hljs-keyword")).not.toBeNull();
    });
  });
});

describe("MessageComposer mode tabs", () => {
  it("animates toolbar row visibility with a subtle transition", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    const toolbarRow = screen.getByTestId("composer-toolbar-row");
    expect(toolbarRow).toHaveClass("transition-[max-height,opacity,transform,padding]");
    expect(toolbarRow).toHaveClass("duration-200");
    expect(toolbarRow).toHaveClass("max-h-0");
    expect(toolbarRow).toHaveClass("opacity-0");

    focusComposerInput();

    expect(toolbarRow).toHaveClass("max-h-12");
    expect(toolbarRow).toHaveClass("opacity-100");
    expect(toolbarRow).toHaveClass("translate-y-0");
  });

  it("shows mode tabs row when composer input gets focus", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    expect(screen.queryByRole("toolbar", { name: /message composer/i })).not.toBeInTheDocument();

    focusComposerInput();

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
    expect(writeIcon).toHaveAttribute("width", "16");
    expect(previewIcon).toHaveAttribute("width", "16");
    expect(previewButton).toHaveClass("text-composer-icon");
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
      expect(onSend).toHaveBeenCalledWith("message with file", "general", [file]);
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
      expect(onSend).toHaveBeenCalledWith("message from drop", "general", [file]);
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
    const inputRow = textbox.parentElement?.parentElement;
    const sendButton = screen.getByRole("button", { name: /write a message/i });

    expect(inputRow).not.toBeNull();
    expect(inputRow?.parentElement).toHaveClass("p-3");
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
      expect(onSend).toHaveBeenCalledWith("hello", "general", undefined);
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

  it("passes custom emoji picker class for themed scrollbar styling", async () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /emoji/i }));
    await screen.findByRole("button", { name: /pick emoji/i });

    const props = emojiPickerMock.mock.calls.at(-1)?.[0] as
      | { className?: string; emojiStyle?: string }
      | undefined;
    expect(props?.className).toContain("composer-emoji-picker");
    expect(props?.emojiStyle).toBe("native");
  });

  it("loads and passes realm custom emojis to composer emoji picker", async () => {
    const realmEmoji = {
      id: "9001",
      names: ["party_parrot"],
      imgUrl: "https://chat.example.test/user_avatars/realm/9001.png",
    };
    fetchRealmEmojisMock.mockResolvedValue([realmEmoji]);

    renderWithProviders(<MessageComposer onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /emoji/i }));

    await waitFor(() => {
      expect(fetchRealmEmojisMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      const props = emojiPickerMock.mock.calls.at(-1)?.[0] as
        | { customEmojis?: unknown[]; emojiStyle?: string }
        | undefined;
      expect(props?.customEmojis).toEqual([realmEmoji]);
      expect(props?.emojiStyle).toBe("native");
    });
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

  it("renders schedule trigger inside formatting toolbar", () => {
    renderWithProviders(<MessageComposer onSend={vi.fn()} />);
    focusComposerInput();

    const toolbar = screen.getByRole("toolbar", { name: /message composer/i });
    const scheduleButton = screen.getByRole("button", { name: /message menu/i });

    expect(toolbar).toContainElement(scheduleButton);
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
      "Message menu",
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

    const backdrop = screen.getByTestId("composer-ai-menu-backdrop");
    fireEvent.click(backdrop);

    expect(screen.queryByTestId("composer-ai-menu-backdrop")).not.toBeInTheDocument();
  });

  it("passes chat context and messages context to AI action menu", () => {
    const messagesContext = [
      {
        id: 1,
        senderId: 42,
        senderName: "Alice",
        content: "Can you review this?",
        timestamp: 1710000001,
        isOwn: false,
      },
    ];
    const chatContext = {
      type: "stream" as const,
      streamName: "engineering",
      topic: "general",
    };

    renderWithProviders(
      <MessageComposer
        onSend={vi.fn()}
        aiMessagesContext={messagesContext}
        aiChatContext={chatContext}
      />,
    );
    focusComposerInput();

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    const props = aiActionMenuMock.mock.calls.at(-1)?.[0] as {
      messagesContext?: unknown;
      chatContext?: unknown;
    };
    expect(props.messagesContext).toEqual(messagesContext);
    expect(props.chatContext).toEqual(chatContext);
  });
});
