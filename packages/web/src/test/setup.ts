import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** jsdom omits `Element.prototype.scrollTo`; scroll containers in component tests need it. */
if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function (
    this: Element,
    options?: ScrollToOptions | number,
    y?: number,
  ): void {
    const el = this as HTMLElement;
    if (typeof options === "object" && options != null) {
      if (options.top != null) el.scrollTop = options.top;
      if (options.left != null) el.scrollLeft = options.left;
    } else if (typeof options === "number") {
      el.scrollTop = options;
      el.scrollLeft = y ?? 0;
    }
  };
}

const storageShim = (): Storage => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
};

const isStorageBroken = () => {
  try {
    window.localStorage.getItem("__test__");
    return false;
  } catch {
    return true;
  }
};

if (typeof window !== "undefined" && isStorageBroken()) {
  Object.defineProperty(window, "localStorage", { value: storageShim(), writable: true });
  Object.defineProperty(window, "sessionStorage", { value: storageShim(), writable: true });
}

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* localStorage may not be available in jsdom */
  }
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
