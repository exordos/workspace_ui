/**
 * Sizes learned by loading a file, for the next time it is rendered.
 *
 * A message states an image's dimensions in the `w`/`h` params of its file link,
 * and the placeholder reserves the box from them. The sending client does not
 * always write them, and nothing can reserve a box for a size nobody knows — so the
 * first render of such an image moves the text below it when the bytes land.
 *
 * It is only unknown once. The browser reports the natural size the moment the
 * image decodes, and every later render of that file — scrolling back, reopening
 * the conversation — can reserve the right box straight away.
 *
 * In memory and bounded: this is a display convenience, and a size it has forgotten
 * simply falls back to the first-render behaviour.
 */
const MAX_REMEMBERED_FILES = 400;

export interface MeasuredMediaSize {
  width: number;
  height: number;
}

const sizesByFileUuid = new Map<string, MeasuredMediaSize>();

function isUsableSize(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

export function rememberMeasuredMediaSize(
  fileUuid: string | null | undefined,
  width: number,
  height: number,
): void {
  if (fileUuid == null || fileUuid.length === 0 || !isUsableSize(width, height)) return;

  // Map keeps insertion order, so re-inserting moves the entry to the end.
  sizesByFileUuid.delete(fileUuid);
  sizesByFileUuid.set(fileUuid, { width, height });
  while (sizesByFileUuid.size > MAX_REMEMBERED_FILES) {
    const oldest = sizesByFileUuid.keys().next();
    if (oldest.done === true) break;
    sizesByFileUuid.delete(oldest.value);
  }
}

export function readMeasuredMediaSize(
  fileUuid: string | null | undefined,
): MeasuredMediaSize | null {
  if (fileUuid == null) return null;
  const size = sizesByFileUuid.get(fileUuid);
  if (size == null) return null;
  sizesByFileUuid.delete(fileUuid);
  sizesByFileUuid.set(fileUuid, size);
  return size;
}

export function clearMeasuredMediaSizes(): void {
  sizesByFileUuid.clear();
}
