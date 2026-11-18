import { afterEach, describe, expect, it, vi } from "vitest";
import { hasHeicFileType, isHeicAttachment } from "./heic-preview-format.lib";
import type { HeicPreviewResult } from "./heic-preview.worker.types";

function withFileTypeBox(majorBrand: string, ...brands: string[]): Blob {
  const header = new Uint8Array(16 + brands.length * 4);
  new DataView(header.buffer).setUint32(0, header.length);
  const encoder = new TextEncoder();
  header.set(encoder.encode("ftyp" + majorBrand), 4);
  header.set(encoder.encode(brands.join("")), 16);
  return new Blob([header]);
}

describe("HEIC format detection", () => {
  it("recognizes HEIC metadata without overriding a known MIME type", () => {
    expect(isHeicAttachment("photo.HEIC", "")).toBe(true);
    expect(isHeicAttachment("photo.heif", "binary/octet-stream")).toBe(true);
    expect(isHeicAttachment("photo", " image/HEIC; x=y")).toBe(true);
    expect(isHeicAttachment("photo.heic", "image/jpeg")).toBe(false);
    expect(isHeicAttachment("report.pdf", "application/octet-stream")).toBe(false);
  });

  it("checks the file type box instead of trusting the name or MIME", async () => {
    await expect(hasHeicFileType(withFileTypeBox("heic", "mif1"))).resolves.toBe(true);
    await expect(hasHeicFileType(withFileTypeBox("mif1", "heix"))).resolves.toBe(true);
    await expect(hasHeicFileType(withFileTypeBox("mif1", "avif"))).resolves.toBe(false);
    await expect(hasHeicFileType(withFileTypeBox("heic").slice(0, 12))).resolves.toBe(false);
    await expect(hasHeicFileType(new Blob(["invalid"], { type: "image/heic" }))).resolves.toBe(
      false,
    );
  });
});

class TestWorker {
  static readonly instances: TestWorker[] = [];
  onmessage: ((event: { data: HeicPreviewResult }) => void) | undefined;
  postMessage = vi.fn<(blob: Blob) => void>();
  terminate = vi.fn();

  constructor() {
    TestWorker.instances.push(this);
  }
}

afterEach(() => {
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  TestWorker.instances.length = 0;
  vi.resetModules();
});

describe("createHeicPreview", () => {
  it("cancels in-flight work and then processes the next preview without changing its source", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", TestWorker);
    const { createHeicPreview } = await import("./heic-preview.lib");

    const canceled = new AbortController();
    const original = withFileTypeBox("heic");
    const first = createHeicPreview(withFileTypeBox("heix"), { signal: canceled.signal });
    const second = createHeicPreview(original);
    const firstFailure = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const [firstWorker] = TestWorker.instances;
    expect(TestWorker.instances).toHaveLength(1);
    expect(firstWorker?.postMessage).toHaveBeenCalledTimes(1);

    canceled.abort();
    await firstFailure;
    expect(firstWorker?.terminate).toHaveBeenCalledOnce();
    const nextWorker = TestWorker.instances.at(1);
    expect(nextWorker?.postMessage).toHaveBeenCalledWith(original);

    const jpeg = new Blob(["JPEG"], { type: "image/jpeg" });
    nextWorker?.onmessage?.({ data: { ok: true, preview: jpeg } });
    await expect(second).resolves.toBe(jpeg);
    expect(original.type).toBe("");
  });
});
