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
    "calendar_month",
    "celebration",
    "globe_location_pin",
    "handshake",
    "info",
    "language",
    "logout",
    "photo_camera",
    "schedule",
    "stylus",
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

  it("uses tight Figma viewBoxes for edit-avatar camera/gallery/delete glyphs", () => {
    // Figma 12719:27019 / 12719:27025 / 12719:27525 — glyphs without 32px artboard padding,
    // otherwise size={24} draws icons noticeably smaller/heavier than neighbors.
    const camera = readFileSync(resolve(ICONS_DIR, "photo_camera.svg"), "utf8");
    const gallery = readFileSync(resolve(ICONS_DIR, "images.svg"), "utf8");
    const trash = readFileSync(resolve(ICONS_DIR, "delete.svg"), "utf8");
    expect(camera).toMatch(/viewBox="0 0 24 22"/);
    expect(gallery).toMatch(/viewBox="0 0 22 22"/);
    expect(gallery).not.toMatch(/viewBox="0 0 32 32"/);
    expect(trash).toMatch(/viewBox="0 0 19 22"/);
    expect(trash).not.toMatch(/viewBox="0 0 24 24"/);
  });

  it("keeps profile-detail icons on square optically-normalized viewBoxes", () => {
    // Figma 12697:37391 — 32×32 boxes; oversized Material canvases (36/40/32) made
    // some glyphs look tiny next to already-cropped ones. Square crop + ~8% pad →
    // uniform fill so a single size={24} matches across the list.
    const profileDetailIcons = [
      "alternate_email",
      "mail",
      "phone",
      "business_center",
      "handshake",
      "account_circle",
      "group",
      "info",
      "globe_location_pin",
      "schedule",
      "calendar_month",
      "celebration",
    ] as const;

    for (const name of profileDetailIcons) {
      const content = readFileSync(resolve(ICONS_DIR, `${name}.svg`), "utf8");
      const match =
        /viewBox="(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(
          content,
        );
      expect(match, `${name} viewBox`).not.toBeNull();
      const width = Number(match?.[3]);
      const height = Number(match?.[4]);
      expect(width).toBeCloseTo(height, 3);
      // Must not keep the oversized source artboards that caused the size mismatch.
      expect(content).not.toMatch(/viewBox="0 0 36 36"/);
      expect(content).not.toMatch(/viewBox="0 0 40 40"/);
    }
  });

  it("keeps all SVG icon assets in one contract", () => {
    const files = readdirSync(ICONS_DIR)
      .filter((file) => file.endsWith(".svg"))
      .sort();

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(resolve(ICONS_DIR, file), "utf8");
      const paths = [...content.matchAll(/<path\b[^>]*>/gi)].map((match) => match[0]);

      expect(content).toMatch(
        /viewBox="-?\d+(?:\.\d+)? -?\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?"/,
      );
      expect(content).not.toMatch(/\bstroke\s*=/i);
      expect(paths.length, `${file} should contain at least one path`).toBeGreaterThan(0);

      for (const pathTag of paths) {
        expect(pathTag).toMatch(/\bfill="currentColor"/);
      }
    }
  });
});
