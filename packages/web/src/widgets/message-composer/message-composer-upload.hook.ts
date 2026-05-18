import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ComposerUploadProgressLike {
  completed: number;
  total: number;
  activeFileName: string | null;
}

type ComposerFileInputEvent =
  | React.ChangeEvent<HTMLInputElement>
  | React.FormEvent<HTMLInputElement>;

function hasFileDragPayload(dataTransfer: DataTransfer): boolean {
  try {
    return Array.from(dataTransfer.types).includes("Files");
  } catch {
    return false;
  }
}

function createAttachmentPreviewUrl(file: File): string | null {
  try {
    if (!file.type.startsWith("image/")) return null;
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
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

  onFileInputChange: (e: ComposerFileInputEvent) => void;
  removeFileByIndex: (index: number) => void;

  uploadProgressPercent: number;
  isUploadInProgress: boolean;
} {
  const { disabled, uploadProgress } = options;

  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const lastHandledSelectionRef = useRef<{
    signature: string;
    eventType: string;
    tsMs: number;
  } | null>(null);

  const filePreviewUrls = useMemo(
    () => files.map((file) => createAttachmentPreviewUrl(file)),
    [files],
  );

  useEffect(() => {
    return () => {
      if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
        return;
      }
      for (const previewUrl of filePreviewUrls) {
        if (previewUrl != null) {
          URL.revokeObjectURL(previewUrl);
        }
      }
    };
  }, [filePreviewUrls]);

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
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        setFiles((prev) => [...prev, ...droppedFiles]);
      }
    },
    [disabled],
  );

  const onFileInputChange = useCallback((e: ComposerFileInputEvent) => {
    const selected = e.currentTarget.files;
    if (!selected?.length) return;
    const selectedFiles = Array.from(selected);
    const signature = selectedFiles
      .map((file) => `${file.name}:${file.size}:${file.type}:${file.lastModified}`)
      .join("|");
    const nowMs = typeof performance === "undefined" ? Date.now() : performance.now();
    const previousSelection = lastHandledSelectionRef.current;
    if (
      previousSelection?.signature === signature &&
      previousSelection.eventType !== e.type &&
      nowMs - previousSelection.tsMs < 400
    ) {
      e.currentTarget.value = "";
      return;
    }
    lastHandledSelectionRef.current = { signature, eventType: e.type, tsMs: nowMs };
    setFiles((prev) => [...prev, ...selectedFiles]);
    e.currentTarget.value = "";
  }, []);

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
    onFileInputChange,
    removeFileByIndex,
    uploadProgressPercent,
    isUploadInProgress,
  };
}
