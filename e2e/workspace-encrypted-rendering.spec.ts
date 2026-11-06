import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_MESSAGE_UUID,
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  messageSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";

const KEY_UUID = "77777777-7777-4777-8777-777777777777";
const MESSAGE_COUNT = 8;
const TEXTS = Array.from(
  { length: MESSAGE_COUNT + 1 },
  (_, index) =>
    `Prepared encrypted message ${index + 1}. ` +
    "This varying-length encrypted text must have its final dimensions before it appears. ".repeat(
      index % 3 === 0 ? 1 : index % 3 === 1 ? 5 : 10,
    ),
);

interface EncryptedRenderingProbe {
  pending: (() => void)[];
  completed: number;
  blockedCiphertext: string | null;
  samples: {
    rows: number;
    placeholders: number;
    tailGap: number | null;
    visiblePreparation: boolean;
  }[];
  existingRows?: Element[];
}

declare global {
  interface Window {
    encryptedRenderingProbe: EncryptedRenderingProbe;
  }
}

type RenderingTestMessage = Omit<ReturnType<typeof messageSuccess>, "payload"> & {
  payload:
    | { kind: "e2ee"; key_uuid: string; content: string }
    | { kind: "markdown"; content: string };
};

async function navigateWithinApp(page: Page, path: string): Promise<void> {
  await page.evaluate((url) => {
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function installEncryptedWindow(
  page: Page,
  encryptedChat: boolean,
): Promise<RenderingTestMessage[]> {
  await expect
    .poll(() =>
      page.evaluate(async (streamUuid) => {
        const { useWorkspaceAuthStore } =
          await import("/src/entities/workspace-auth/workspace-auth.model.ts");
        const { useMessengerStore } = await import("/src/entities/messenger/messenger.model.ts");
        const catalog = useMessengerStore.getState();
        return (
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext() != null &&
          catalog.ownerKey != null &&
          catalog.streamsById[streamUuid] != null
        );
      }, E2E_STREAM_UUID),
    )
    .toBe(true);
  const contents = await page.evaluate(
    async ({ streamUuid, keyUuid, texts, encryptedChat }) => {
      const { useWorkspaceAuthStore } =
        await import("/src/entities/workspace-auth/workspace-auth.model.ts");
      const { useMessengerStore } = await import("/src/entities/messenger/messenger.model.ts");
      const { ensureChatDeviceIdentity, realChatKeyStorage, realChatCryptoProvider } =
        await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
      const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      const catalog = useMessengerStore.getState();
      const stream = catalog.streamsById[streamUuid];
      if (runtime == null || stream == null || catalog.ownerKey == null)
        throw new Error("Missing test runtime or stream");
      const device = await ensureChatDeviceIdentity(runtime, () => true);
      const key = await realChatCryptoProvider.createGroupKey();
      if (!key.ok) throw new Error("Key creation failed");
      await realChatKeyStorage.writeChatKey(
        { owner: runtime, deviceId: device.deviceId, streamUuid, keyUuid },
        { groupKey: key.value },
      );
      const updatedStream = { ...stream, encryption: encryptedChat };
      if (encryptedChat) updatedStream.currentEncryptionKey = { keyUuid };
      else delete updatedStream.currentEncryptionKey;
      catalog.upsertStream(catalog.ownerKey, updatedStream);
      const encrypted = await Promise.all(
        texts.map(async (text) => {
          const result = await realChatCryptoProvider.encryptMessage({
            groupKey: key.value,
            plaintext: new TextEncoder().encode(text),
            context: { streamUuid, keyUuid },
          });
          if (!result.ok) throw new Error("Encryption failed");
          return btoa(String.fromCharCode(...result.value.bytes));
        }),
      );

      const probe: EncryptedRenderingProbe = {
        pending: [],
        completed: 0,
        samples: [],
        blockedCiphertext: encrypted[texts.length - 2] ?? null,
      };
      window.encryptedRenderingProbe = probe;
      const decrypt = realChatCryptoProvider.decryptMessage.bind(realChatCryptoProvider);
      realChatCryptoProvider.decryptMessage = async (...args) => {
        const content = btoa(String.fromCharCode(...args[0].envelope.bytes));
        if (content === probe.blockedCiphertext)
          await new Promise<void>((resolve) => probe.pending.push(resolve));
        const result = await decrypt(...args);
        probe.completed++;
        return result;
      };
      const sampleFrame = () => {
        const feed = document.querySelector<HTMLElement>(
          "[data-workspace-scroll-controller='true']",
        );
        const rows = feed?.querySelectorAll("article[data-message-uuid]").length ?? 0;
        const visible =
          feed?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ?? false;
        const preparation = document.querySelector<HTMLElement>(
          "[data-workspace-message-preparation]",
        );
        const preparationIndicator =
          preparation?.querySelector("svg, span, .animate-spin") ??
          (preparation?.textContent?.trim() ? preparation : null);
        probe.samples.push({
          visiblePreparation:
            preparationIndicator?.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            }) ?? false,
          rows: visible ? rows : 0,
          placeholders: feed?.querySelectorAll("[data-encrypted-message-placeholder]").length ?? 0,
          tailGap:
            visible && feed != null && rows > 0
              ? feed.scrollHeight - feed.clientHeight - feed.scrollTop
              : null,
        });
        requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
      return encrypted;
    },
    { streamUuid: E2E_STREAM_UUID, keyUuid: KEY_UUID, texts: TEXTS, encryptedChat },
  );

  const history = contents.map(
    (content, index): RenderingTestMessage => ({
      ...messageSuccess(
        "",
        index === MESSAGE_COUNT - 1
          ? E2E_MESSAGE_UUID
          : `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
      ),
      payload:
        !encryptedChat && index < MESSAGE_COUNT && index % 2 === 0
          ? { kind: "markdown", content: TEXTS[index] ?? "Ordinary message" }
          : { kind: "e2ee", key_uuid: KEY_UUID, content },
      created_at: new Date(Date.parse("2026-10-01T10:00:00Z") + index * 60_000).toISOString(),
      updated_at: "2026-10-01T10:00:00Z",
    }),
  );
  const stream = {
    ...streamsSuccess()[0],
    encryption: encryptedChat,
    ...(encryptedChat ? { current_encryption_key_uuid: KEY_UUID } : {}),
  };
  await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
  });
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const query = new URL(route.request().url()).searchParams;
    const items = query.get("read") === "false" ? [] : history.slice(0, MESSAGE_COUNT);
    if (query.get("sort_dir") === "desc") items.reverse();
    await route.fulfill({ json: items });
  });
  return history;
}

async function stageMessages(
  page: Page,
  dtos: RenderingTestMessage[],
  direction: "live" | "before",
) {
  await page.evaluate(
    async ({ dtos, direction }) => {
      const { useWorkspaceMessageStore } = await import("/src/entities/message/message.model.ts");
      const { adaptMessengerMessage } =
        await import("/src/entities/messenger/messenger-adapters.lib.ts");
      const messages = dtos.map(adaptMessengerMessage);
      const first = messages[0];
      if (first?.payload.kind !== "e2ee") throw new Error("Missing encrypted message");
      const probe = window.encryptedRenderingProbe;
      probe.blockedCiphertext = first.payload.content;
      probe.existingRows = [...document.querySelectorAll("article[data-message-uuid]")];
      const store = useWorkspaceMessageStore.getState();
      if (direction === "live") return store.applyLiveCreatedMessages(messages);
      const conversationWindow = store.conversationWindowsById[first.conversationId];
      if (conversationWindow == null) throw new Error("Missing history window");
      store.mergeConversationWindowPage({
        conversationId: first.conversationId,
        expectedRevision: conversationWindow.revision,
        expectedPageMarker: conversationWindow.beforePageMarker,
        capturedMutationRevision: store.messageMutationRevision,
        direction: "before",
        messages,
        pageMarker: null,
      });
    },
    { dtos, direction },
  );
}

async function releaseDecryption(page: Page) {
  await page.evaluate(() => {
    const probe = window.encryptedRenderingProbe;
    probe.blockedCiphertext = null;
    for (const release of probe.pending.splice(0)) release();
  });
}

async function expectExistingRows(page: Page) {
  expect(
    await page.evaluate(() =>
      window.encryptedRenderingProbe.existingRows?.every((row) => row.isConnected),
    ),
  ).toBe(true);
}

for (const encryptedChat of [true, false]) {
  test(`${encryptedChat ? "encrypted" : "ordinary-native mixed"} history appears prepared as one window and keeps its tail position @mock`, async ({
    authenticated: page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1100, height: 844 });
    const history = await installEncryptedWindow(page, encryptedChat);
    const encryptedCount = history
      .slice(0, MESSAGE_COUNT)
      .filter((message) => message.payload.kind === "e2ee").length;
    await navigateWithinApp(
      page,
      `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`,
    );
    const rows = page.locator(
      "[data-workspace-scroll-controller='true'] article[data-message-uuid]",
    );
    await expect
      .poll(() => page.evaluate(() => window.encryptedRenderingProbe.pending.length))
      .toBeGreaterThan(0);
    // All shorter decryptions finish while one message still holds the window gate.
    await expect
      .poll(() => page.evaluate(() => window.encryptedRenderingProbe.completed))
      .toBeGreaterThanOrEqual(encryptedCount - 1);
    await expect(rows).toHaveCount(0);
    await releaseDecryption(page);
    await expect(rows).toHaveCount(MESSAGE_COUNT);
    await expect(rows.last()).toContainText("Prepared encrypted message 8.");
    await expect
      .poll(() =>
        page
          .locator("[data-workspace-scroll-controller='true']")
          .evaluate((feed) => feed.scrollHeight - feed.clientHeight - feed.scrollTop),
      )
      .toBeLessThanOrEqual(2);
    const samples = await page.evaluate(() => window.encryptedRenderingProbe.samples);
    expect(samples.some((sample) => sample.rows === MESSAGE_COUNT)).toBe(true);
    expect(samples.every((sample) => sample.rows === 0 || sample.rows === MESSAGE_COUNT)).toBe(
      true,
    );
    expect(samples.every((sample) => sample.placeholders === 0)).toBe(true);
    expect(samples.every((sample) => !sample.visiblePreparation)).toBe(true);
    expect(
      samples
        .filter((sample) => sample.tailGap != null)
        .every((sample) => Math.abs(sample.tailGap ?? 0) <= 2),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("encrypted-history-ready.png") });

    const appended = history[MESSAGE_COUNT];
    if (appended == null) throw new Error("Missing appended fixture");
    await stageMessages(page, [appended], "live");
    await expect
      .poll(() => page.evaluate(() => window.encryptedRenderingProbe.pending.length))
      .toBeGreaterThan(0);
    await expect(rows).toHaveCount(MESSAGE_COUNT);
    await expectExistingRows(page);
    await releaseDecryption(page);
    await expect(rows).toHaveCount(MESSAGE_COUNT + 1);
    await expect(rows.last()).toContainText("Prepared encrypted message 9.");
    await expectExistingRows(page);
    await expect(page.locator("[data-encrypted-message-placeholder]")).toHaveCount(0);

    const feed = page.locator("[data-workspace-scroll-controller='true']");
    await feed.hover();
    await page.mouse.wheel(0, -300);
    await expect(feed).toHaveAttribute("data-scroll-at-bottom", "false");
    const anchor = await feed.evaluate((root) => {
      const top = root.getBoundingClientRect().top;
      const row = [...root.querySelectorAll<HTMLElement>("article[data-message-uuid]")].find(
        (node) => node.getBoundingClientRect().bottom > top,
      );
      if (row == null) throw new Error("Missing visible reading anchor");
      return { uuid: row.dataset.messageUuid, offset: row.getBoundingClientRect().top - top };
    });
    const older = history
      .filter((message) => message.payload.kind === "e2ee")
      .slice(0, 2)
      .map((message, index) => ({
        ...message,
        uuid: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
        created_at: new Date(Date.parse("2026-10-01T09:00:00Z") + index * 60_000).toISOString(),
      }));
    const completedBeforePage = await page.evaluate(() => window.encryptedRenderingProbe.completed);
    await stageMessages(page, older, "before");
    const expectReadingOffset = async () => {
      await expect
        .poll(() =>
          page.locator(`article[data-message-uuid='${anchor.uuid}']`).evaluate((row) => {
            const root = row.closest("[data-workspace-scroll-controller='true']");
            if (root == null) throw new Error("Missing scroll container");
            return row.getBoundingClientRect().top - root.getBoundingClientRect().top;
          }),
        )
        .toBeCloseTo(anchor.offset, 0);
    };
    await expect
      .poll(() => page.evaluate(() => window.encryptedRenderingProbe.pending.length))
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.evaluate(() => window.encryptedRenderingProbe.completed))
      .toBeGreaterThan(completedBeforePage);
    // The page is published as a batch, even when one decryption finishes early.
    await expect(rows).toHaveCount(MESSAGE_COUNT + 1);
    await expectReadingOffset();
    await releaseDecryption(page);
    await expect(rows).toHaveCount(MESSAGE_COUNT + 3);
    await expectReadingOffset();
  });
}
