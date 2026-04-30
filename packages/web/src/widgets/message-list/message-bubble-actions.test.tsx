import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCallParticipantsStore } from "~/entities/call/call.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createUser } from "~/test/factories";
import { MessageBubble } from "./message-bubble.ui";

const buildAuthHeaderMock = vi.fn(() => ({}));

vi.mock("~/shared/api/zulip-client.internal", () => ({
  getRealmBaseUrl: () => "https://uploads.example.com",
}));

vi.mock("~/shared/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      USER_UPLOADS_PATH_PREFIX: "",
    },
  };
});

vi.mock("~/shared/lib/auth-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/auth-guard")>();
  return {
    ...actual,
    buildAuthHeader: () => buildAuthHeaderMock(),
  };
});

function createMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 101,
    sender_id: 77,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: "<p>Hello</p>",
    timestamp: 1710000000,
    ...overrides,
  };
}

describe("MessageBubble edit/delete actions parity", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    useUsersStore.getState().clear();
    useCallParticipantsStore.setState({ participantsByUrl: {} });
    buildAuthHeaderMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("hides edit and delete actions for non-own messages", async () => {
    render(<MessageBubble message={createMessage()} isOwn={false} />);

    fireEvent.contextMenu(screen.getByTestId("message-101"));
    expect(await screen.findByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /(edit|редакт)/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /(delete|удал)/i })).not.toBeInTheDocument();
  });

  it("shows edit and delete actions for own messages and dispatches callbacks", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <MessageBubble
        message={createMessage()}
        isOwn
        callbacks={{
          onEdit,
          onDelete,
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-101"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /(edit|редакт)/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }));

    fireEvent.contextMenu(screen.getByTestId("message-101"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /(delete|удал)/i }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }));
  });

  it("dispatches select action from context menu", async () => {
    const onSelect = vi.fn();

    render(
      <MessageBubble
        message={createMessage()}
        isOwn={false}
        callbacks={{
          onSelect,
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-101"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /select/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }));
  });

  it("renders SVG icons for every message action menu item", async () => {
    render(
      <MessageBubble
        message={createMessage()}
        isOwn={false}
        callbacks={{
          onOpenInChat: vi.fn(),
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-101"));
    const menuItems = await screen.findAllByRole("menuitem");

    expect(menuItems.length).toBeGreaterThan(0);
    for (const menuItem of menuItems) {
      expect(menuItem.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("renders regular message actions grouped in a logical order", async () => {
    render(
      <MessageBubble
        message={createMessage({ id: 103 })}
        isOwn={false}
        callbacks={{
          onOpenInChat: vi.fn(),
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-103"));

    const menuItems = await screen.findAllByRole("menuitem");
    const labels = menuItems.map((item) => item.textContent?.trim());

    expect(labels).toEqual([
      "Reply",
      "Forward",
      "Open in chat",
      "Copy text",
      "Views",
      "Star",
      "Select",
    ]);
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("positions message menu trigger outside bubble text area", () => {
    const { rerender } = render(<MessageBubble message={createMessage()} isOwn />);

    const ownMenuTrigger = screen.getByRole("button", { name: /message menu/i });
    expect(ownMenuTrigger).toHaveClass("-left-8");
    expect(ownMenuTrigger).not.toHaveClass("left-1");

    rerender(<MessageBubble message={createMessage({ id: 102 })} isOwn={false} />);

    const incomingMenuTrigger = screen.getByRole("button", { name: /message menu/i });
    expect(incomingMenuTrigger).toHaveClass("-right-8");
    expect(incomingMenuTrigger).not.toHaveClass("right-1");
  });

  it("calls author callback when avatar is clicked", () => {
    const onAuthorClick = vi.fn();

    render(
      <MessageBubble
        message={createMessage()}
        isOwn={false}
        callbacks={{
          onAuthorClick,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open profile/i }));
    expect(onAuthorClick).toHaveBeenCalledWith(77);
  });

  it("renders author avatar with large profile size", () => {
    render(<MessageBubble message={createMessage()} isOwn={false} />);

    const avatarButton = screen.getByRole("button", { name: /open profile/i });
    const avatarElement = avatarButton.querySelector("div");
    expect(avatarElement).toHaveClass("w-12");
    expect(avatarElement).toHaveClass("h-12");
  });

  it("renders presence indicator for author avatar when presence is known", () => {
    const now = Math.floor(Date.now() / 1000);
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 77,
        full_name: "Alice",
        presence: { status: "idle", timestamp: now },
      }),
    );

    render(<MessageBubble message={createMessage()} isOwn={false} />);

    expect(screen.getByRole("status", { name: /away/i })).toBeInTheDocument();
  });

  it("shows author custom status next to sender name", () => {
    useUsersStore.getState().mergeUser({
      user_id: 77,
      full_name: "Alice",
      status: { text: "Deep work", emojiName: "speech_balloon", away: false },
    });

    render(<MessageBubble message={createMessage()} isOwn={false} />);

    expect(screen.getByText("💬 Deep work")).toBeInTheDocument();
  });

  it("uses dedicated own-message background token for outgoing messages", () => {
    const { container } = render(<MessageBubble message={createMessage()} isOwn />);

    const messageBody = container.querySelector(".message-body");
    expect(messageBody).not.toBeNull();

    const ownBubbleSurface = messageBody?.parentElement;
    expect(ownBubbleSurface).toHaveClass("bg-msg-own-bg");
  });

  it("shows single sent indicator for delivered own messages", () => {
    render(<MessageBubble message={createMessage()} isOwn />);

    expect(screen.getByTitle(/sent to server/i)).toBeInTheDocument();
    expect(screen.queryByText("✓✓")).not.toBeInTheDocument();
  });

  it("keeps message content selectable", () => {
    const { container } = render(<MessageBubble message={createMessage()} isOwn={false} />);

    expect(screen.getByTestId("message-101")).toHaveClass("selectable");
    expect(container.querySelector(".message-body")).toHaveClass("select-text");
  });

  it("opens read-receipts flow when clicking sent indicator", () => {
    const onViews = vi.fn();

    render(
      <MessageBubble
        message={createMessage()}
        isOwn
        callbacks={{
          onViews,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("message-delivery-101"));

    expect(onViews).toHaveBeenCalledTimes(1);
    expect(onViews).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }));
  });

  it("shows static pending icon for optimistic own messages without sent check", () => {
    render(
      <MessageBubble
        message={createMessage({
          delivery_status: "sending",
        })}
        isOwn
      />,
    );

    const deliveryIndicator = screen.getByTestId("message-delivery-101");
    expect(deliveryIndicator).toBeInTheDocument();
    expect(screen.getByText(/sending/i)).toHaveClass("sr-only");
    expect(deliveryIndicator.querySelector("svg")).toBeInTheDocument();
    expect(deliveryIndicator.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByTitle(/sent to server/i)).not.toBeInTheDocument();
  });

  it("shows not-delivered state for failed own messages when retry/remove callbacks are absent", () => {
    render(
      <MessageBubble
        message={createMessage({
          delivery_status: "failed",
        })}
        isOwn
      />,
    );

    expect(screen.getByText(/not delivered/i)).toBeInTheDocument();
    expect(screen.queryByTitle(/sent to server/i)).not.toBeInTheDocument();
  });

  it("shows retry and remove for failed own messages when callbacks are provided", () => {
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    render(
      <MessageBubble
        message={createMessage({
          id: -1,
          delivery_status: "failed",
        })}
        isOwn
        callbacks={{
          onRetryFailedOutgoing: onRetry,
          onRemoveFailedOutgoing: onRemove,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry send/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /remove message/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("does not leave protected video source URL in rendered HTML", () => {
    const { container } = render(
      <MessageBubble
        message={createMessage({
          content:
            '<p>video</p><video controls><source src="/user_uploads/1/private.mp4" type="video/mp4" /></video>',
        })}
        isOwn={false}
      />,
    );

    const source = container.querySelector("source");
    expect(source).not.toBeNull();
    expect(source?.getAttribute("src")).toBeNull();
    expect(source?.getAttribute("data-auth-src")).toContain("/user_uploads/");
  });

  it("does not leave protected image source URL in rendered HTML", () => {
    const { container } = render(
      <MessageBubble
        message={createMessage({
          content: '<p>image</p><img src="/user_uploads/1/private.png" alt="private image" />',
        })}
        isOwn={false}
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).not.toContain("/user_uploads/");
    expect(image?.getAttribute("data-auth-src")).toContain("/user_uploads/thumbnail/");
  });

  it("keeps markdown user_upload image links as links instead of expanding them into inline images", () => {
    render(
      <MessageBubble
        message={createMessage({
          content: "[image.png](/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png)",
        })}
        isOwn={false}
      />,
    );

    const link = screen.getByRole("link", { name: "image.png" });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toMatch(
      /\/user_uploads\/2\/ff\/aP3oHiNs40xdmpUNVol7Z5ga\/image\.png$/,
    );
    expect(link.querySelector("img")).toBeNull();
  });

  it("does not leave external_content preview URL in rendered img src", () => {
    const { container } = render(
      <MessageBubble
        message={createMessage({
          content:
            '<p>preview</p><img src="/external_content/preview.png?url=https%3A%2F%2Fexample.com" alt="link preview" />',
        })}
        isOwn={false}
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).not.toContain("/external_content/");
    expect(image?.getAttribute("data-auth-src")).toContain("/external_content/preview.png");
  });

  it("strips protected srcset, sizes, poster, and style attrs from rendered message media", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const { container } = render(
      <MessageBubble
        message={createMessage({
          content:
            '<p style="color:red">preview</p><picture><source srcset="/external_content/a.webp 1x, /external_content/b.webp 2x" sizes="100vw"><img srcset="/external_content/c.png 1x, /external_content/d.png 2x" sizes="50vw" style="background-image:url(/external_content/bg.png)" alt="link preview"></picture><video poster="/external_content/poster.png"><source src="/user_uploads/1/private.mp4" type="video/mp4" /></video>',
        })}
        isOwn={false}
      />,
    );

    const image = container.querySelector("img");
    const pictureSource = container.querySelector("picture source");
    const video = container.querySelector("video");
    const videoSource = container.querySelector("video source");
    const styledParagraph = container.querySelector("p");

    expect(styledParagraph?.getAttribute("style")).toContain("color:red");
    expect(image?.hasAttribute("srcset")).toBe(false);
    expect(image?.hasAttribute("sizes")).toBe(false);
    expect(image?.hasAttribute("style")).toBe(false);
    expect(image?.getAttribute("data-auth-src")).toContain("/external_content/d.png");
    expect(image?.getAttribute("src")).not.toContain("/external_content/");
    expect(pictureSource).not.toBeNull();
    expect(pictureSource?.hasAttribute("srcset")).toBe(false);
    expect(pictureSource?.hasAttribute("sizes")).toBe(false);
    expect(video?.getAttribute("poster")).toBeNull();
    expect(video?.getAttribute("data-auth-poster")).toContain("/external_content/poster.png");
    expect(videoSource?.getAttribute("src")).toBeNull();
    expect(videoSource?.getAttribute("data-auth-src")).toContain("/user_uploads/1/private.mp4");
  });

  it("keeps Zulip embed background image off the live DOM until authenticated fetch resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const { container } = render(
      <MessageBubble
        message={createMessage({
          content:
            '<div class="message_embed"><a class="message_embed_image" href="https://habr.com/ru/articles/1024154/" style="background-image:url(&quot;/external_content/hash/preview.jpeg&quot;)"></a></div>',
        })}
        isOwn={false}
      />,
    );

    const embedImage = container.querySelector<HTMLElement>(".message_embed_image");
    expect(embedImage).not.toBeNull();
    expect(embedImage?.getAttribute("style")).toBeNull();
    expect(embedImage?.getAttribute("data-auth-background-image")).toBe(
      "/external_content/hash/preview.jpeg",
    );
  });

  it("loads protected image preview through normalized user_uploads path", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const s = String(input);
      if (
        s.includes("/user_uploads/thumbnail/1/private.png/840x560.webp") ||
        s === "/user_uploads/1/private.png" ||
        s.endsWith("/user_uploads/1/private.png")
      ) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["ok"])),
        });
      }
      return Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const { container } = render(
      <MessageBubble
        message={createMessage({
          content: '<p>image</p><img src="/user_uploads/1/private.png" alt="private image" />',
        })}
        isOwn={false}
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("blob:test-image");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/user_uploads\/thumbnail\/1\/private\.png\/840x560\.webp$/),
      expect.objectContaining({
        headers: { Authorization: "Basic test" },
      }),
    );
  });

  it("loads external_content preview through authenticated fetch without thumbnail rewrite", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const s = String(input);
      if (
        s === "/external_content/preview.png?url=https%3A%2F%2Fexample.com" ||
        s ===
          "https://uploads.example.com/external_content/preview.png?url=https%3A%2F%2Fexample.com"
      ) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["ok"])),
        });
      }
      return Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-preview");
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const { container } = render(
      <MessageBubble
        message={createMessage({
          content:
            '<p>preview</p><img src="/external_content/preview.png?url=https%3A%2F%2Fexample.com" alt="link preview" />',
        })}
        isOwn={false}
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("blob:test-preview");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/external_content\/preview\.png\?url=https%3A%2F%2Fexample\.com$/),
      expect.objectContaining({
        headers: { Authorization: "Basic test" },
      }),
    );
  });

  it("loads Zulip embed background preview through authenticated fetch and applies only blob style", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const s = String(input);
      if (
        s === "/external_content/hash/preview.jpeg" ||
        s === "https://uploads.example.com/external_content/hash/preview.jpeg"
      ) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["ok"])),
        });
      }
      return Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-embed-preview");
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const { container } = render(
      <MessageBubble
        message={createMessage({
          content:
            '<div class="message_embed"><a class="message_embed_image" href="https://habr.com/ru/articles/1024154/" style="background-image:url(&quot;/external_content/hash/preview.jpeg&quot;)"></a></div>',
        })}
        isOwn={false}
      />,
    );

    const embedImage = container.querySelector<HTMLElement>(".message_embed_image");
    expect(embedImage).not.toBeNull();
    expect(embedImage?.getAttribute("style")).toBeNull();

    await waitFor(() => {
      expect(embedImage?.style.backgroundImage).toContain("blob:test-embed-preview");
    });
    expect(embedImage?.style.backgroundImage).not.toContain("/external_content/");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/external_content\/hash\/preview\.jpeg$/),
      expect.objectContaining({
        headers: { Authorization: "Basic test" },
      }),
    );
  });

  it("loads user_uploads previews through a single canonical fetch URL", async () => {
    const canonicalThumbnailPath =
      "https://uploads.example.com/user_uploads/thumbnail/2/ee/H37di7GmS3N2EkehVcH83MaM/image.png/840x560.webp";
    const fetchMock = vi.fn((input: string | URL) => {
      const s = String(input);
      if (s === canonicalThumbnailPath) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["ok"])),
        });
      }
      return Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-thumbnail");
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const { container } = render(
      <MessageBubble
        message={createMessage({
          content: `<p>image</p><img src="https://zulip.genesis-core.tech/user_uploads/thumbnail/2/ee/H37di7GmS3N2EkehVcH83MaM/image.png/840x560.webp" alt="private image" />`,
        })}
        isOwn={false}
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("blob:test-thumbnail");
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      canonicalThumbnailPath,
      expect.objectContaining({
        headers: { Authorization: "Basic test" },
      }),
    );
  });

  it("keeps the placeholder image when protected preview fetch fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const originalImageUrl =
      "https://uploads.example.com/user_uploads/thumbnail/1/private.png/840x560.webp";
    const { container } = render(
      <MessageBubble
        message={createMessage({
          content: `<p>image</p><img src="${originalImageUrl}" alt="private image" />`,
        })}
        isOwn={false}
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(image?.getAttribute("src")).not.toBe(originalImageUrl);
    expect(image?.getAttribute("src")).toContain("data:image/svg+xml,");
  });

  it("keeps video source unset when protected fetch fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const originalVideoUrl = "https://uploads.example.com/user_uploads/1/private.mp4";
    const { container } = render(
      <MessageBubble
        message={createMessage({
          content: `<p>video</p><video controls><source src="${originalVideoUrl}" type="video/mp4" /></video>`,
        })}
        isOwn={false}
      />,
    );

    const source = container.querySelector("source");
    expect(source).not.toBeNull();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(source?.getAttribute("src")).toBeNull();
    expect(source?.getAttribute("data-auth-src")).toContain("/user_uploads/1/private.mp4");
  });

  it("keeps Zulip embed background image empty when protected fetch fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        blob: () => Promise.resolve(new Blob([])),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const { container } = render(
      <MessageBubble
        message={createMessage({
          content:
            '<div class="message_embed"><a class="message_embed_image" href="https://habr.com/ru/articles/1024154/" style="background-image:url(&quot;/external_content/hash/preview.jpeg&quot;)"></a></div>',
        })}
        isOwn={false}
      />,
    );

    const embedImage = container.querySelector<HTMLElement>(".message_embed_image");
    expect(embedImage).not.toBeNull();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(embedImage?.getAttribute("style")).toBeNull();
    expect(embedImage?.style.backgroundImage).toBe("");
    expect(embedImage?.style.backgroundImage).not.toContain("/external_content/");
  });

  it("renders redesigned jitsi call bubble metadata and participant stack", () => {
    const jitsiUrl = "https://meet.jit.si/design-sync-room";
    useCallParticipantsStore.setState({
      participantsByUrl: {
        [jitsiUrl]: [
          { displayName: "Alice Johnson" },
          { displayName: "Bob Smith" },
          { displayName: "Charlie Rose" },
          { displayName: "Daria Khan" },
        ],
      },
    });
    const onOpenJitsiCall = vi.fn();

    render(
      <MessageBubble
        message={createMessage({
          content: jitsiUrl,
          subject: "Topic 2",
        })}
        isOwn
        callbacks={{ onOpenJitsiCall }}
      />,
    );

    const jitsiCallButton = screen
      .getAllByRole("button", { name: /call/i })
      .find((element) => element.className.includes("cursor-pointer"));

    expect(jitsiCallButton).toBeDefined();
    expect(jitsiCallButton).toHaveClass("rounded-[18px]");
    expect(jitsiCallButton).toHaveClass("rounded-br-[6px]");
    expect(jitsiCallButton).toHaveClass("bg-msg-call-bg");
    expect(jitsiCallButton).not.toHaveClass("bg-msg-own-bg");
    expect(jitsiCallButton).not.toHaveClass("rounded-xl");
    expect(jitsiCallButton).toHaveTextContent(/design sync room/i);
    expect(jitsiCallButton).toHaveTextContent(/#\s*topic 2/i);
    expect(screen.getByTestId("jitsi-call-participants-101")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();

    fireEvent.click(jitsiCallButton!);
    expect(onOpenJitsiCall).toHaveBeenCalledWith(jitsiUrl, "");
  });

  it("shows standard actions plus join call for jitsi call messages", async () => {
    const jitsiUrl = "https://meet.jit.si/action-menu-room";
    const onOpenJitsiCall = vi.fn();
    const onSelect = vi.fn();

    render(
      <MessageBubble
        message={createMessage({
          id: 105,
          content: jitsiUrl,
        })}
        isOwn={false}
        callbacks={{ onOpenJitsiCall, onSelect }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-105"));

    expect(await screen.findByRole("menuitem", { name: /join call/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /select/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /join call/i }));
    expect(onOpenJitsiCall).toHaveBeenCalledWith(jitsiUrl, "");

    fireEvent.contextMenu(screen.getByTestId("message-105"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /select/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 105 }));
  });

  it("renders call message actions with call-specific group first", async () => {
    const jitsiUrl = "https://meet.jit.si/grouped-call-room";

    render(
      <MessageBubble
        message={createMessage({
          id: 107,
          content: jitsiUrl,
        })}
        isOwn={false}
        callbacks={{
          onOpenJitsiCall: vi.fn(),
          onCopy: vi.fn(),
          onOpenInChat: vi.fn(),
        }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-107"));

    const menuItems = await screen.findAllByRole("menuitem");
    const labels = menuItems.map((item) => item.textContent?.trim());

    expect(labels).toEqual([
      "Join call",
      "Copy call link",
      "Reply",
      "Forward",
      "Open in chat",
      "Copy text",
      "Views",
      "Star",
      "Select",
    ]);
    expect(screen.getAllByRole("separator")).toHaveLength(3);
  });

  it("copies jitsi call link from context menu", async () => {
    const jitsiUrl = "https://meet.jit.si/copy-call-room";
    const onCopy = vi.fn();

    render(
      <MessageBubble
        message={createMessage({
          id: 106,
          content: jitsiUrl,
        })}
        isOwn={false}
        callbacks={{ onCopy }}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("message-106"));

    const copyCallLinkItem = await screen.findByRole("menuitem", { name: /copy call link/i });
    fireEvent.click(copyCallLinkItem);

    expect(onCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 106,
        content: jitsiUrl,
      }),
    );
  });

  it("delegates zulip permalink clicks to callback navigation handler", async () => {
    const onPermalinkClick = vi.fn(() => true);

    render(
      <MessageBubble
        message={createMessage({
          id: 108,
          content:
            "@_**Alice|77** [wrote](https://zulip.example.com/#narrow/dm/42-dm/near/987):\n```quote\nHi\n```",
        })}
        isOwn={false}
        callbacks={{ onPermalinkClick }}
      />,
    );

    const link = await screen.findByRole("link", { name: "wrote" });
    fireEvent.click(link);
    expect(onPermalinkClick).toHaveBeenCalledWith(
      "https://zulip.example.com/#narrow/dm/42-dm/near/987",
    );
  });
});
