import { getElectronAPI, isElectron } from "./electron";
import { createLogger } from "./logger";

const log = createLogger("clipboard");

export async function writeText(text: string): Promise<boolean> {
  // В Electron всегда пишем через IPC, чтобы не зависеть от Web Clipboard API.
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

  // В браузере используем стандартный API `navigator.clipboard`.
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
  // В Electron чтение буфера делаем через main-процесс.
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

  // В браузере читаем напрямую через `navigator.clipboard.readText`.
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
