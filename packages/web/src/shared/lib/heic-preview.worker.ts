import createLibheif from "../../../vendor/heic/libheif.js";
import { hasHeicFileType } from "./heic-preview-format.lib";
import type { HeicPreviewResult } from "./heic-preview.worker.types";

const MAX_PREVIEW_DIMENSION = 2048;
const MAX_SOURCE_PIXELS = 50_000_000;
const MAX_SOURCE_DIMENSION = 16_384;
const JPEG_QUALITY = 0.88;

let libheif: Awaited<ReturnType<typeof createLibheif>> | undefined;

async function renderJpeg(pixels: ImageData): Promise<Blob> {
  const scale = Math.min(1, MAX_PREVIEW_DIMENSION / Math.max(pixels.width, pixels.height));
  const width = Math.max(1, Math.round(pixels.width * scale));
  const height = Math.max(1, Math.round(pixels.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false });
  if (context == null) throw new Error("HEIC preview canvas is unavailable");

  const bitmap = await createImageBitmap(pixels, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });
  try {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
  } finally {
    bitmap.close();
  }
  const preview = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  if (preview.type !== "image/jpeg") throw new Error("HEIC preview could not be encoded as JPEG");
  return preview;
}

async function decodePreview(blob: Blob): Promise<Blob> {
  if (!(await hasHeicFileType(blob))) throw new Error("Invalid HEIC file type");

  libheif ??= await createLibheif();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoder = new libheif.HeifDecoder();
  let images: ReturnType<typeof decoder.decode> = [];
  try {
    images = decoder.decode(bytes);
    const image = images.find((candidate) => candidate.is_primary()) ?? images[0];
    if (image == null) throw new Error("HEIC file has no primary image");

    const width = image.get_width();
    const height = image.get_height();
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_SOURCE_DIMENSION ||
      height > MAX_SOURCE_DIMENSION ||
      width * height > MAX_SOURCE_PIXELS
    ) {
      throw new Error("HEIC file exceeds preview dimensions");
    }

    const pixels = await new Promise<ImageData>((resolve, reject) => {
      image.display(new ImageData(width, height), (result) => {
        if (result == null) reject(new Error("HEIC image could not be decoded"));
        else resolve(result);
      });
    });
    return await renderJpeg(pixels);
  } finally {
    for (const image of images) image.free();
    if (decoder.decoder != null) libheif.heif_context_free(decoder.decoder);
  }
}

// A dedicated worker receives messages only from the client that created it.
// eslint-disable-next-line sonarjs/post-message
self.addEventListener("message", (event: MessageEvent<Blob>) => {
  function send(result: HeicPreviewResult): void {
    self.postMessage(result);
  }

  void decodePreview(event.data).then(
    (preview) => send({ ok: true, preview }),
    () => send({ ok: false }),
  );
});
