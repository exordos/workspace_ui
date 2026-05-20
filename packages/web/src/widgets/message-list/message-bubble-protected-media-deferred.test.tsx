import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
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

function createProtectedImageMessage(): MockMessage {
  return createMessage({
    id: 501,
    content: '<p>image</p><img src="/user_uploads/1/private.png" alt="private image" />',
  }) as MockMessage;
}

interface IoInstance {
  callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;
  observed: Element[];
}

describe("MessageBubble deferred protected media (IntersectionObserver)", () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  let ioInstances: IoInstance[] = [];
  let lastObserverRoot: Element | Document | null = null;

  class IntersectionObserverDeferredMock implements IntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds: readonly number[];
    disconnect = vi.fn();
    observe = vi.fn();
    takeRecords = vi.fn((): IntersectionObserverEntry[] => []);
    unobserve = vi.fn();
    private readonly instance: IoInstance;

    constructor(
      callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
      options?: IntersectionObserverInit,
    ) {
      this.instance = { callback, observed: [] };
      ioInstances.push(this.instance);
      this.root = options?.root ?? null;
      lastObserverRoot = this.root;
      this.rootMargin = options?.rootMargin ?? "";
      this.thresholds = options?.threshold != null ? [options.threshold as number] : [0];
      this.observe = vi.fn((element: Element) => {
        this.instance.observed.push(element);
      });
    }
  }

  function fireIntersection(target: Element, isIntersecting: boolean): void {
    const entry = {
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      target,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: new DOMRectReadOnly(),
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry;

    for (const instance of ioInstances) {
      if (!instance.observed.includes(target)) continue;
      instance.callback([entry], {} as IntersectionObserver);
    }
  }

  beforeEach(() => {
    ioInstances = [];
    lastObserverRoot = null;
    buildAuthHeaderMock.mockReset();
    globalThis.IntersectionObserver = IntersectionObserverDeferredMock;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  it("does not fetch protected image until IO reports intersecting inside role=feed", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const s = String(input);
      if (s.includes("/user_uploads/thumbnail/1/private.png/840x560.webp")) {
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
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:deferred-test");
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const { container } = render(
      <div role="feed" className="h-40 overflow-y-auto">
        <MessageBubble message={createProtectedImageMessage()} isOwn={false} />
      </div>,
    );

    expect(lastObserverRoot).toBe(container.firstChild);
    expect(fetchMock).not.toHaveBeenCalled();

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(ioInstances.some((inst) => inst.observed.includes(image!))).toBe(true);

    fireIntersection(image!, false);
    expect(fetchMock).not.toHaveBeenCalled();

    fireIntersection(image!, true);

    await waitFor(() => {
      expect(image?.getAttribute("src")).toBe("blob:deferred-test");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("second intersecting callback does not fetch again after unobserve", async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const s = String(input);
      if (s.includes("/user_uploads/thumbnail/1/private.png/840x560.webp")) {
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
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:deferred-once");
    buildAuthHeaderMock.mockReturnValue({ Authorization: "Basic test" });

    const { container } = render(
      <div role="feed">
        <MessageBubble message={createProtectedImageMessage()} isOwn={false} />
      </div>,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    fireIntersection(image!, true);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireIntersection(image!, true);

    await new Promise((r) => {
      setTimeout(r, 30);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
