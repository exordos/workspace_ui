import type { RefObject } from "react";

export function assignQuickListActiveItemRef(
  activeItemRef: RefObject<HTMLButtonElement | null>,
  isActive: boolean,
  node: HTMLButtonElement | null,
): void {
  if (isActive) {
    activeItemRef.current = node;
  }
}

export function createQuickListFolderSelectHandler(
  onSelect: (folderId: string) => void,
  folderId: string,
): () => void {
  return () => {
    onSelect(folderId);
  };
}
