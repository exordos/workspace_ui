import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES } from "./icon";

const ICONS_DIR = (() => {
  const packageRelative = resolve(process.cwd(), "src/shared/assets/icons");
  if (existsSync(packageRelative)) {
    return packageRelative;
  }
  return resolve(process.cwd(), "packages/web/src/shared/assets/icons");
})();

describe("Icon", () => {
  it.each([
    "accountCircle",
    "businessCenter",
    "handshake",
    "info",
    "language",
    "logout",
    "volumeUp",
  ])("renders migrated Flutter icon '%s'", (iconName) => {
    const { container } = render(<Icon name={iconName} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("returns null for unknown icon names", () => {
    const { container } = render(<Icon name={"__unknown__"} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("applies requested size consistently for every registered icon", () => {
    for (const iconName of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={iconName} size={24} />);
      const svg = container.querySelector("svg");

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("width", "24");
      expect(svg).toHaveAttribute("height", "24");

      unmount();
    }
  });

  it.each([
    "at",
    "attach",
    "bell",
    "channels",
    "chevron-down",
    "chevron-up",
    "chevron-right",
    "flag",
    "grid",
    "heart",
    "pen",
    "pin",
    "plus",
    "profile",
    "smile",
    "thumbs-up",
    "fullscreen",
    "fullscreen_exit",
  ])("uses filled icon style for '%s'", (iconName) => {
    const { container } = render(<Icon name={iconName} />);
    const svg = container.querySelector("svg");
    const path = container.querySelector("path");

    expect(svg).toBeInTheDocument();
    expect(path).toBeInTheDocument();
    expect(svg?.getAttribute("stroke")).toBeNull();
    expect(path?.getAttribute("stroke")).toBeNull();
    expect(path?.getAttribute("fill")).toBe("currentColor");
  });

  it("keeps all SVG icon assets in one contract", () => {
    const files = readdirSync(ICONS_DIR)
      .filter((file) => file.endsWith(".svg"))
      .sort();

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(resolve(ICONS_DIR, file), "utf8");
      const paths = [...content.matchAll(/<path\b[^>]*>/gi)].map((match) => match[0]);

      expect(content).toMatch(/viewBox="0 0 \d+ \d+"/);
      expect(content).not.toMatch(/\bstroke\s*=/i);
      expect(paths.length, `${file} should contain at least one path`).toBeGreaterThan(0);

      for (const pathTag of paths) {
        expect(pathTag).toMatch(/\bfill="currentColor"/);
      }
    }
  });
});
