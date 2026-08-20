import { getElectronAPI, isElectron } from "./electron";
import { createLogger } from "./logger";

const log = createLogger("clipboard");

async function convertImageToPng(image: Blob): Promise<Blob> {
  if (image.type === "image/png") {
    return image;
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error("Image bitmap conversion is unavailable");
  }

  const bitmap = await createImageBitmap(image);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (context == null) {
      throw new Error("Image canvas context is unavailable");
    }
    context.drawImage(bitmap, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob == null) {
          reject(new Error("Image PNG conversion failed"));
          return;
        }
        resolve(blob);
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
}

export async function writeImage(image: Blob | Promise<Blob>): Promise<boolean> {
  if (isElectron()) {
    const write = getElectronAPI()?.clipboard?.writeImage;
    if (write == null) {
      log.warn("Image clipboard write API unavailable in Electron runtime");
      return false;
    }
    try {
      const resolvedImage = await image;
      const bytes = new Uint8Array(await resolvedImage.arrayBuffer());
      return await write(bytes);
    } catch (error) {
      log.warn("Image clipboard write failed in Electron runtime", { error: String(error) });
      return false;
    }
  }

  const clipboardApi = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (
    clipboardApi?.write == null ||
    typeof ClipboardItem === "undefined" ||
    typeof document === "undefined"
  ) {
    log.warn("Image clipboard write API unavailable in browser runtime");
    return false;
  }

  try {
    const pngImage = Promise.resolve(image).then(convertImageToPng);
    await clipboardApi.write([new ClipboardItem({ "image/png": pngImage })]);
    return true;
  } catch (error) {
    log.warn("Image clipboard write failed in browser runtime", { error: String(error) });
    return false;
  }
}

export async function writeText(text: string): Promise<boolean> {
  // Electron: IPC avoids unreliable Web Clipboard API in the renderer.
  if (isElectron()) {
    const write = getElectronAPI()?.clipboard?.writeText;
    if (write == null) {
      log.warn("Clipboard write API unavailable in Electron runtime", { valueLength: text.length });
      return false;
    }
    try {
      return await write(text);
    } catch (error) {
      log.warn("Clipboard write failed in Electron runtime", {
        valueLength: text.length,
        error: String(error),
      });
      return false;
    }
  }

  const clipboardApi = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clipboardApi?.writeText == null) {
    log.warn("Clipboard write API unavailable in browser runtime", { valueLength: text.length });
    return false;
  }

  try {
    await clipboardApi.writeText(text);
    return true;
  } catch (error) {
    log.warn("Clipboard write failed in browser runtime", {
      valueLength: text.length,
      error: String(error),
    });
    return false;
  }
}

export async function readText(): Promise<string | null> {
  if (isElectron()) {
    const read = getElectronAPI()?.clipboard?.readText;
    if (read == null) {
      log.warn("Clipboard read API unavailable in Electron runtime");
      return null;
    }
    try {
      return await read();
    } catch (error) {
      log.warn("Clipboard read failed in Electron runtime", { error: String(error) });
      return null;
    }
  }

  const clipboardApi = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clipboardApi?.readText == null) {
    log.warn("Clipboard read API unavailable in browser runtime");
    return null;
  }

  try {
    return await clipboardApi.readText();
  } catch (error) {
    log.warn("Clipboard read failed in browser runtime", { error: String(error) });
    return null;
  }
}
