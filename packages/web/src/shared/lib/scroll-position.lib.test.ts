// Тесты для общего helper'а прокрутки вниз.
// Проверяем оба режима: обычный instant для автоскроллов и smooth только для явного пользовательского действия.
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToBottom } from "./scroll-position.lib";

// Сохраняем исходную реализацию matchMedia, чтобы после тестов вернуть окружение в исходное состояние.
const originalMatchMedia = typeof window === "undefined" ? undefined : window.matchMedia;

// Создаёт тестовый DOM-элемент с заданной высотой содержимого.
// Нужен, чтобы проверять, к какому значению top helper отправляет прокрутку.
function createScrollElement(scrollHeight: number): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });

  return el;
}

describe("scrollToBottom", () => {
  afterEach(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Возвращаем matchMedia после каждого теста, чтобы моки не протекали между кейсами.
    if (typeof originalMatchMedia === "function") {
      window.matchMedia = originalMatchMedia;
      return;
    }

    Reflect.deleteProperty(window, "matchMedia");
  });

  it("scrolls instantly by default", () => {
    const el = createScrollElement(960);
    const scrollTo = vi.fn();
    Object.defineProperty(el, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    scrollToBottom(el);

    expect(scrollTo).toHaveBeenCalledWith({ top: 960, behavior: "instant" });
  });

  it("uses smooth behavior when requested", () => {
    const el = createScrollElement(720);
    const scrollTo = vi.fn();
    Object.defineProperty(el, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    scrollToBottom(el, "smooth");

    expect(scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "smooth" });
  });

  it("falls back to instant when reduced motion is enabled", () => {
    const el = createScrollElement(640);
    const scrollTo = vi.fn();
    Object.defineProperty(el, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    scrollToBottom(el, "smooth");

    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: "instant" });
  });
});
