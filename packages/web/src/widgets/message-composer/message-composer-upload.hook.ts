import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLikelyImageAttachment, normalizeImageAttachmentFile } from "./message-composer-body.lib";

interface ComposerUploadProgressLike {
  completed: number;
  total: number;
  activeFileName: string | null;
}

type ComposerFileInputEvent = React.ChangeEvent<HTMLInputElement>;

interface FileSelectionSessionState {
  sessionId: number;
  handled: boolean;
  pendingInputFiles: File[] | null;
}

function hasFileDragPayload(dataTransfer: DataTransfer): boolean {
  try {
    return Array.from(dataTransfer.types).includes("Files");
  } catch {
    return false;
  }
}

function createAttachmentPreviewUrl(file: File): string | null {
  try {
    if (!isLikelyImageAttachment(file)) return null;
    const normalized = normalizeImageAttachmentFile(file);
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(normalized);
  } catch {
    return null;
  }
}

function revokeAttachmentPreviewUrl(previewUrl: string | null): void {
  if (previewUrl == null) return;
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(previewUrl);
}

export function useMessageComposerUpload(options: {
  disabled: boolean;
  uploadProgress?: ComposerUploadProgressLike | null;
}): {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  filePreviewUrls: (string | null)[];

  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;

  beginFileSelectionSession: () => void;
  onFileInputChange: (e: ComposerFileInputEvent) => void;
  removeFileByIndex: (index: number) => void;

  uploadProgressPercent: number;
  isUploadInProgress: boolean;
} {
  const { disabled, uploadProgress } = options;

  const [files, setFiles] = useState<File[]>([]);
  const [filePreviewUrls, setFilePreviewUrls] = useState<(string | null)[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const filePreviewUrlByFileRef = useRef(new Map<File, string | null>());
  // One picker open = one session; commit selected files at most once per session.
  const fileSelectionSessionRef = useRef<FileSelectionSessionState>({
    sessionId: 0,
    handled: false,
    pendingInputFiles: null,
  });

  useEffect(() => {
    const previewUrlByFile = filePreviewUrlByFileRef.current;
    const nextFiles = new Set(files);

    for (const [file, previewUrl] of previewUrlByFile) {
      if (!nextFiles.has(file)) {
        revokeAttachmentPreviewUrl(previewUrl);
        previewUrlByFile.delete(file);
      }
    }

    for (const file of files) {
      if (!previewUrlByFile.has(file)) {
        previewUrlByFile.set(file, createAttachmentPreviewUrl(file));
      }
    }

    setFilePreviewUrls(files.map((file) => previewUrlByFile.get(file) ?? null));
  }, [files]);

  useEffect(() => {
    const previewUrlByFile = filePreviewUrlByFileRef.current;
    return () => {
      for (const previewUrl of previewUrlByFile.values()) {
        revokeAttachmentPreviewUrl(previewUrl);
      }
      previewUrlByFile.clear();
    };
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!hasFileDragPayload(e.dataTransfer)) return;
      e.preventDefault();
      setIsDragOver(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasFileDragPayload(e.dataTransfer)) return;
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const droppedFiles = Array.from(e.dataTransfer.files).map((file) =>
        normalizeImageAttachmentFile(file),
      );
      if (droppedFiles.length > 0) {
        setFiles((prev) => [...prev, ...droppedFiles]);
      }
    },
    [disabled],
  );

  const beginFileSelectionSession = useCallback(() => {
    fileSelectionSessionRef.current = {
      sessionId: fileSelectionSessionRef.current.sessionId + 1,
      handled: false,
      pendingInputFiles: null,
    };
  }, []);

  // After a handled session, auto-start a new session only for `change` (re-select same file; ignore late `input`).
  const getSessionForEvent = useCallback((eventType: string): FileSelectionSessionState | null => {
    const currentSession = fileSelectionSessionRef.current;
    if (!currentSession.handled) {
      return currentSession;
    }
    if (eventType !== "change") {
      return null;
    }
    const nextSession: FileSelectionSessionState = {
      sessionId: currentSession.sessionId + 1,
      handled: false,
      pendingInputFiles: null,
    };
    fileSelectionSessionRef.current = nextSession;
    return nextSession;
  }, []);

  const commitSelectionForSession = useCallback(
    (sessionId: number, selectedFiles: File[]): boolean => {
      const currentSession = fileSelectionSessionRef.current;
      if (
        currentSession.sessionId !== sessionId ||
        currentSession.handled ||
        selectedFiles.length === 0
      ) {
        return false;
      }
      setFiles((prev) => [...prev, ...selectedFiles]);
      fileSelectionSessionRef.current = {
        sessionId,
        handled: true,
        pendingInputFiles: null,
      };
      return true;
    },
    [],
  );

  const onFileInputChange = useCallback(
    (e: ComposerFileInputEvent) => {
      const selected = e.currentTarget.files;
      if (!selected?.length) return;
      const inputElement = e.currentTarget;
      const selectedFiles = Array.from(selected);
      const activeSession = getSessionForEvent(e.type);
      if (activeSession == null) {
        return;
      }
      const sessionId = activeSession.sessionId;
      if (e.type === "input") {
        // Prefer `change`; platforms without it commit from `input` in a microtask.
        fileSelectionSessionRef.current = {
          sessionId,
          handled: false,
          pendingInputFiles: selectedFiles,
        };
        void Promise.resolve().then(() => {
          const currentSession = fileSelectionSessionRef.current;
          if (currentSession.sessionId !== sessionId || currentSession.handled) return;
          const pendingFiles = currentSession.pendingInputFiles;
          if (pendingFiles == null || pendingFiles.length === 0) return;
          if (!commitSelectionForSession(sessionId, pendingFiles)) return;
          inputElement.value = "";
        });
        return;
      }
      commitSelectionForSession(sessionId, selectedFiles);
      inputElement.value = "";
    },
    [commitSelectionForSession, getSessionForEvent],
  );

  const removeFileByIndex = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadProgressPercent = useMemo(() => {
    if (uploadProgress == null || uploadProgress.total <= 0) return 0;
    return Math.round((uploadProgress.completed / uploadProgress.total) * 100);
  }, [uploadProgress]);

  const isUploadInProgress = useMemo(() => {
    return (
      uploadProgress != null &&
      uploadProgress.total > 0 &&
      uploadProgress.completed < uploadProgress.total
    );
  }, [uploadProgress]);

  return {
    files,
    setFiles,
    filePreviewUrls,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    beginFileSelectionSession,
    onFileInputChange,
    removeFileByIndex,
    uploadProgressPercent,
    isUploadInProgress,
  };
}
