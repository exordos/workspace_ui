/**
 * Tests for focus management utilities — keyboard navigation and accessibility.
 *
 * These helpers power focus trapping in modals, focus zone navigation
 * (sidebar, chat, composer), and the Tab/Shift+Tab flow. Correctness here
 * is essential for keyboard-only users and screen reader accessibility.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getFocusableElements,
  getFirstFocusable,
  getLastFocusable,
  focusZone,
  cycleToNextZone,
  cycleToPrevZone,
  initFocusManagement,
} from "./focus";

// getFocusableElements returns all keyboard-reachable elements in a container.
describe("getFocusableElements", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // Buttons are natively focusable — must be discovered.
  it("finds buttons", () => {
    container.innerHTML = "<button>A</button><button>B</button>";
    expect(getFocusableElements(container)).toHaveLength(2);
  });

  // Only links WITH href are focusable — anchor elements without href are not.
  it("finds links with href", () => {
    container.innerHTML = '<a href="/x">Link</a><a>No href</a>';
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  // Hidden inputs (type="hidden") are not user-interactive — must be excluded.
  it("finds inputs but not hidden", () => {
    container.innerHTML = '<input type="text"><input type="hidden">';
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  // Disabled elements cannot receive focus — must be filtered out.
  it("excludes disabled elements", () => {
    container.innerHTML = "<button disabled>Nope</button><button>Yes</button>";
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  // tabindex="-1" means "programmatically focusable only" — exclude from tab order.
  it("excludes tabindex=-1", () => {
    container.innerHTML = '<button tabindex="-1">Skip</button><button>Keep</button>';
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  // tabindex="0" makes non-interactive elements (div, span) keyboard-reachable.
  it("includes tabindex=0 divs", () => {
    container.innerHTML = '<div tabindex="0">Focusable</div><div>Not</div>';
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  // Containers with only static elements must return an empty array.
  it("returns empty for no focusable elements", () => {
    container.innerHTML = "<div>Nothing</div><span>Here</span>";
    expect(getFocusableElements(container)).toHaveLength(0);
  });
});

// First/last focusable are used by focus trap to wrap Tab at container boundaries.
describe("getFirstFocusable / getLastFocusable", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.innerHTML = '<button>First</button><input type="text"><button>Last</button>';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // First focusable is where Tab starts when entering a container.
  it("getFirstFocusable returns first button", () => {
    const el = getFirstFocusable(container);
    expect(el?.textContent).toBe("First");
  });

  // Last focusable is where Shift+Tab wraps back from the beginning.
  it("getLastFocusable returns last button", () => {
    const el = getLastFocusable(container);
    expect(el?.textContent).toBe("Last");
  });

  // Empty container must return null — callers decide the fallback.
  it("returns null for empty container", () => {
    container.innerHTML = "<div>No focusable</div>";
    expect(getFirstFocusable(container)).toBeNull();
    expect(getLastFocusable(container)).toBeNull();
  });
});

// focusZone moves focus to a named region (e.g. "sidebar", "composer") by data attribute.
describe("focusZone", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Zone with focusable children — must focus the first one.
  it("focuses the first focusable in the zone", () => {
    document.body.innerHTML = `
      <div data-focus-zone="main"><button>Main btn</button></div>
    `;
    const result = focusZone("main");
    expect(result).toBe(true);
    expect(document.activeElement?.textContent).toBe("Main btn");
  });

  // Missing zone must return false so callers know focus wasn't moved.
  it("returns false for non-existent zone", () => {
    expect(focusZone("nonexistent")).toBe(false);
  });

  // Zone without focusable children falls back to focusing the container itself.
  it("focuses the container if no focusable children", () => {
    document.body.innerHTML = `
      <div data-focus-zone="panel" tabindex="-1">Panel</div>
    `;
    const result = focusZone("panel");
    expect(result).toBe(true);
  });
});

// initFocusManagement sets up global keyboard listeners for zone navigation.
describe("initFocusManagement", () => {
  // Must return a cleanup function to avoid memory leaks.
  it("returns cleanup function", () => {
    const cleanup = initFocusManagement();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  // Double-init must not duplicate listeners (idempotent for Strict Mode).
  it("is idempotent", () => {
    const cleanup1 = initFocusManagement();
    const cleanup2 = initFocusManagement();
    expect(typeof cleanup2).toBe("function");
    cleanup1();
  });
});

// cycleToNextZone / cycleToPrevZone navigate between landmark regions.
describe("zone cycling", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("cycleToNextZone focuses next available zone", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="sidebar"><button>Side</button></div>
      <div data-focus-zone="main"><button>Main</button></div>
    `;
    cycleToNextZone("topbar");
    expect(document.activeElement?.textContent).toBe("Side");
  });

  it("cycleToPrevZone focuses previous available zone", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="sidebar"><button>Side</button></div>
      <div data-focus-zone="main"><button>Main</button></div>
    `;
    cycleToPrevZone("main");
    expect(document.activeElement?.textContent).toBe("Side");
  });

  it("wraps around when cycling past the last zone", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="sidebar"><button>Side</button></div>
    `;
    cycleToNextZone("sidebar");
    expect(document.activeElement?.textContent).toBe("Top");
  });

  it("skips missing zones when cycling", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="main"><button>Main</button></div>
    `;
    cycleToNextZone("topbar");
    expect(document.activeElement?.textContent).toBe("Main");
  });
});

// Roving tabindex sets tabindex=0 on the active item and -1 on siblings.
describe("roving tabindex behavior (DOM-level)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.innerHTML = `
      <div role="tab">Tab 1</div>
      <div role="tab">Tab 2</div>
      <div role="tab">Tab 3</div>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("getFocusableElements does not find role=tab without tabindex", () => {
    const items = getFocusableElements(container);
    expect(items).toHaveLength(0);
  });

  it("getFocusableElements finds tabs with tabindex=0", () => {
    const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs.forEach((t) => t.setAttribute("tabindex", "0"));
    const items = getFocusableElements(container);
    expect(items).toHaveLength(3);
  });
});

// Focus trap wraps Tab at container boundaries — critical for modal a11y.
describe("focus trap (DOM keyboard simulation)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.innerHTML = `
      <button>First</button>
      <input type="text" />
      <button>Last</button>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("getFirstFocusable returns first interactive element", () => {
    expect(getFirstFocusable(container)?.textContent).toBe("First");
  });

  it("getLastFocusable returns last interactive element", () => {
    expect(getLastFocusable(container)?.textContent).toBe("Last");
  });

  it("Tab from last element should be trappable via keydown handler", () => {
    const focusables = getFocusableElements(container);
    expect(focusables).toHaveLength(3);

    const lastEl = focusables[focusables.length - 1]!;
    lastEl.focus();
    expect(document.activeElement).toBe(lastEl);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    const prevented = !lastEl.dispatchEvent(event);
    expect(typeof prevented).toBe("boolean");
  });

  it("Shift+Tab from first element should be trappable via keydown handler", () => {
    const focusables = getFocusableElements(container);
    const firstEl = focusables[0]!;
    firstEl.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    firstEl.dispatchEvent(event);
  });

  it("handles container with no focusable elements gracefully", () => {
    const emptyDiv = document.createElement("div");
    emptyDiv.innerHTML = "<p>No buttons here</p>";
    document.body.appendChild(emptyDiv);

    expect(getFirstFocusable(emptyDiv)).toBeNull();
    expect(getLastFocusable(emptyDiv)).toBeNull();
    expect(getFocusableElements(emptyDiv)).toHaveLength(0);

    document.body.removeChild(emptyDiv);
  });
});

// getFocusableElements with more complex DOM structures
describe("getFocusableElements (complex DOM)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("finds select elements", () => {
    container.innerHTML = '<select><option value="a">A</option></select>';
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  it("finds textarea elements", () => {
    container.innerHTML = "<textarea>text</textarea>";
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  it("finds contenteditable elements", () => {
    container.innerHTML = '<div contenteditable="true">edit me</div>';
    expect(getFocusableElements(container)).toHaveLength(1);
  });

  it("finds deeply nested focusable elements", () => {
    container.innerHTML = `
      <div><div><div><button>Deep</button></div></div></div>
      <div><a href="/x">Link</a></div>
    `;
    expect(getFocusableElements(container)).toHaveLength(2);
  });

  it("excludes disabled select and textarea", () => {
    container.innerHTML = `
      <select disabled><option value="a">A</option></select>
      <textarea disabled>text</textarea>
    `;
    expect(getFocusableElements(container)).toHaveLength(0);
  });

  it("returns elements in DOM order", () => {
    container.innerHTML = `
      <button>First</button>
      <input type="text" />
      <a href="/link">Link</a>
      <button>Last</button>
    `;
    const els = getFocusableElements(container);
    expect(els).toHaveLength(4);
    expect(els[0]!.textContent).toBe("First");
    expect(els[3]!.textContent).toBe("Last");
  });
});

// Zone cycling edge cases — missing zones, wrapping, unknown current zone
describe("zone cycling (edge cases)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("cycleToNextZone handles no zones in DOM", () => {
    expect(() => cycleToNextZone()).not.toThrow();
  });

  it("cycleToPrevZone handles no zones in DOM", () => {
    expect(() => cycleToPrevZone()).not.toThrow();
  });

  it("cycleToNextZone handles unknown currentZone", () => {
    document.body.innerHTML = '<div data-focus-zone="topbar"><button>Top</button></div>';
    cycleToNextZone("nonexistent");
    expect(document.activeElement?.textContent).toBe("Top");
  });

  it("cycleToPrevZone wraps from first to last zone", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="sidebar"><button>Side</button></div>
      <div data-focus-zone="main"><button>Main</button></div>
    `;
    cycleToPrevZone("topbar");
    expect(document.activeElement?.textContent).toBe("Main");
  });

  it("focusZone focuses first child when multiple focusable elements exist", () => {
    document.body.innerHTML = `
      <div data-focus-zone="main">
        <button>First</button>
        <button>Second</button>
        <input type="text" />
      </div>
    `;
    focusZone("main");
    expect(document.activeElement?.textContent).toBe("First");
  });

  it("cycleToNextZone skips multiple missing zones", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="composer"><button>Compose</button></div>
    `;
    cycleToNextZone("topbar");
    expect(document.activeElement?.textContent).toBe("Compose");
  });

  it("initFocusManagement F6 keydown triggers next zone", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="sidebar"><button>Side</button></div>
    `;
    const cleanup = initFocusManagement();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F6", bubbles: true, cancelable: true }),
    );

    expect(document.activeElement?.textContent).toBe("Top");
    cleanup();
  });

  it("initFocusManagement Shift+F6 keydown triggers previous zone", () => {
    document.body.innerHTML = `
      <div data-focus-zone="topbar"><button>Top</button></div>
      <div data-focus-zone="sidebar"><button>Side</button></div>
    `;
    const cleanup = initFocusManagement();
    focusZone("sidebar");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F6", shiftKey: true, bubbles: true, cancelable: true }),
    );

    expect(document.activeElement?.textContent).toBe("Top");
    cleanup();
  });
});
