import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageComposerProps } from "./message-composer.types";

interface UseComposerDraftParams {
  initialValue: MessageComposerProps["initialValue"];
  editSession: MessageComposerProps["editSession"];
  onValueChange: MessageComposerProps["onValueChange"];
  setAiMenuOpen: (open: boolean) => void;
  setScheduleMenuOpen: (open: boolean) => void;
  setSavedSnippetsMenuOpen: (open: boolean) => void;
  setMediaPickerOpen: (open: boolean) => void;
  setMode: (mode: "write" | "preview") => void;
}

export function useComposerDraft({
  initialValue,
  editSession,
  onValueChange,
  setAiMenuOpen,
  setScheduleMenuOpen,
  setSavedSnippetsMenuOpen,
  setMediaPickerOpen,
  setMode,
}: UseComposerDraftParams) {
  const [value, setRawValue] = useState(initialValue ?? "");
  const isEditing = editSession != null;
  const editModeDraftSnapshotRef = useRef<string | null>(null);
  const activeEditMessageIdRef = useRef<number | null>(null);
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    if (isEditing) return;
    if (initialValue !== initialValueRef.current) {
      initialValueRef.current = initialValue;
      setRawValue(initialValue ?? "");
    }
  }, [initialValue, isEditing]);

  useEffect(() => {
    if (!isEditing || editSession == null) {
      if (activeEditMessageIdRef.current == null) return;
      activeEditMessageIdRef.current = null;
      if (editModeDraftSnapshotRef.current != null) {
        setRawValue(editModeDraftSnapshotRef.current);
      }
      editModeDraftSnapshotRef.current = null;
      return;
    }

    if (activeEditMessageIdRef.current === editSession.messageId) return;
    if (activeEditMessageIdRef.current == null) {
      editModeDraftSnapshotRef.current = value;
    }
    activeEditMessageIdRef.current = editSession.messageId;
    setRawValue(editSession.initialMarkdown);
    setAiMenuOpen(false);
    setScheduleMenuOpen(false);
    setSavedSnippetsMenuOpen(false);
    setMediaPickerOpen(false);
    setMode("write");
  }, [
    editSession,
    isEditing,
    value,
    setAiMenuOpen,
    setScheduleMenuOpen,
    setSavedSnippetsMenuOpen,
    setMediaPickerOpen,
    setMode,
  ]);

  const setValue = useCallback(
    (next: string | ((prev: string) => string)) => {
      setRawValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (!isEditing) {
          onValueChange?.(resolved);
        }
        return resolved;
      });
    },
    [isEditing, onValueChange],
  );

  return {
    value,
    setValue,
    setRawValue,
    isEditing,
  };
}
