/**
 * An image's size is unknown only until it has been loaded once. What this has to
 * get right is remembering it, forgetting in bounded fashion, and never handing back
 * a size that would reserve a nonsensical box.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMeasuredMediaSizes,
  readMeasuredMediaSize,
  rememberMeasuredMediaSize,
} from "./workspace-media-measured-size.lib";

describe("measured media sizes", () => {
  beforeEach(() => {
    clearMeasuredMediaSizes();
  });

  it("knows nothing about a file it has not seen", () => {
    expect(readMeasuredMediaSize("file-1")).toBeNull();
    expect(readMeasuredMediaSize(null)).toBeNull();
  });

  it("returns the size it measured", () => {
    rememberMeasuredMediaSize("file-1", 400, 300);
    expect(readMeasuredMediaSize("file-1")).toEqual({ width: 400, height: 300 });
  });

  // A zero or a NaN would reserve a box that collapses, which is worse than none.
  it("refuses a size that cannot describe a box", () => {
    rememberMeasuredMediaSize("file-1", 0, 300);
    rememberMeasuredMediaSize("file-2", 400, Number.NaN);
    rememberMeasuredMediaSize("", 400, 300);

    expect(readMeasuredMediaSize("file-1")).toBeNull();
    expect(readMeasuredMediaSize("file-2")).toBeNull();
  });

  it("drops the least recently used file past its bound", () => {
    for (let index = 0; index < 401; index += 1) {
      rememberMeasuredMediaSize(`file-${index}`, 100 + index, 100);
    }

    expect(readMeasuredMediaSize("file-0")).toBeNull();
    expect(readMeasuredMediaSize("file-400")).toEqual({ width: 500, height: 100 });
  });

  it("counts a read as use, so a file still on screen is not evicted", () => {
    for (let index = 0; index < 400; index += 1) {
      rememberMeasuredMediaSize(`file-${index}`, 100, 100);
    }
    readMeasuredMediaSize("file-0");
    rememberMeasuredMediaSize("file-new", 100, 100);

    expect(readMeasuredMediaSize("file-0")).not.toBeNull();
    expect(readMeasuredMediaSize("file-1")).toBeNull();
  });
});
