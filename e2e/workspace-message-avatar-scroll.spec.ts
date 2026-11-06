import { expect, test } from "./fixtures";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";
import { messageSuccess } from "./mocks/workspace-default-responses";

const PEER_UUID = "66666666-6666-4666-8666-666666666666";

for (const selectionMode of [false, true]) {
  test(`keeps the author avatar visible within its group while scrolling (${selectionMode ? "selection" : "normal"})`, async ({
    authenticated: page,
  }, testInfo) => {
    await page.routeWebSocket(/\/api\/workspace\/v1\/events\/ws/, (socket) => {
      socket.send(
        JSON.stringify({ type: "ready", epoch_generation: "avatar-test", epoch_version: 1 }),
      );
    });
    const messages = [
      ...Array.from({ length: 24 }, (_, index) => ({
        ...messageSuccess(
          `Peer message ${index}\n\nSecond paragraph in the same message.`,
          `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`,
        ),
        author_uuid: PEER_UUID,
        is_own: false,
        created_at: new Date(Date.UTC(2026, 6, 16, 10, index)).toISOString(),
      })),
      {
        ...messageSuccess(
          Array.from({ length: 50 }, () => "Following author paragraph.").join("\n\n"),
        ),
        created_at: "2026-07-16T10:25:00.000Z",
      },
    ];
    await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const query = new URL(route.request().url()).searchParams;
      if (query.has("page_marker") || query.get("read") === "false") {
        return route.fulfill({ json: [] });
      }
      await route.fulfill({
        json: query.get("sort_dir") === "desc" ? [...messages].reverse() : messages,
      });
    });
    await openStreamChatWithComposer(page);
    const feed = page.getByRole("feed");
    const group = feed.locator(`[data-author-group][data-author-uuid='${PEER_UUID}']`);
    const avatar = group.locator("[data-workspace-peer-avatar='true']");
    await expect(group.locator("[data-message-uuid]")).toHaveCount(24);
    await expect(avatar).toHaveCount(1);

    if (selectionMode) {
      await group
        .locator("[data-workspace-message-bubble='true']")
        .last()
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: /^(выбрать|select)$/i }).click();
      await expect(group.locator("[data-workspace-message-selection-control]")).toHaveCount(24);
    }

    // Context-menu targeting may reveal overflowing bubbles horizontally in a narrow chat.
    await feed.evaluate((element) => {
      element.scrollLeft = 0;
      const main = element.closest("main");
      if (main != null) main.scrollLeft = 0;
    });
    await feed.hover();
    await page.mouse.wheel(0, -120);
    await expect(feed).toHaveAttribute("data-scroll-at-bottom", "false");

    // Assert actual geometry: class-name checks cannot detect broken sticky containment.
    for (const offset of [120, 280, 120]) {
      await group.evaluate((element, offset) => {
        const scroll = element.closest<HTMLElement>("[data-workspace-scroll-controller]")!;
        scroll.scrollTop +=
          element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + offset;
        scroll.dispatchEvent(new Event("scroll"));
      }, offset);
      await expect(avatar).toBeInViewport({ ratio: 1 });
      await expect
        .poll(() =>
          avatar.evaluate((element) => {
            const viewport = element.closest("[data-workspace-scroll-controller]")!;
            const padding = parseFloat(getComputedStyle(viewport).paddingBottom);
            return Math.abs(
              viewport.getBoundingClientRect().bottom -
                padding -
                element.getBoundingClientRect().bottom -
                8,
            );
          }),
        )
        .toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: testInfo.outputPath("sticky-avatar.png") });

    // Once the group's end enters the viewport, the avatar stays at that end.
    await group.evaluate((element) => {
      const scroll = element.closest<HTMLElement>("[data-workspace-scroll-controller]")!;
      scroll.scrollTop +=
        element.getBoundingClientRect().bottom - scroll.getBoundingClientRect().bottom + 120;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await expect(avatar).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        avatar.evaluate((element) => {
          const group = element.closest("[data-author-group]")!.getBoundingClientRect();
          return Math.abs(group.bottom - element.getBoundingClientRect().bottom - 8);
        }),
      )
      .toBeLessThanOrEqual(1);

    await group.evaluate((element) => {
      const scroll = element.closest<HTMLElement>("[data-workspace-scroll-controller]")!;
      scroll.scrollTop +=
        element.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top + 20;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await expect(avatar).not.toBeInViewport();
    await expect(
      feed.locator("[data-author-group][data-message-owner='own'] [data-workspace-peer-avatar]"),
    ).toHaveCount(0);
  });
}
