import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ComposerUploadProgressLike {
  completed: number;
  total: number;
  activeFileName: string | null;
}

type ComposerFileInputEvent =
  | React.ChangeEvent<HTMLInputElement>
  | React.FormEvent<HTMLInputElement>;

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

  beginFileSelectionSession: () => void;
  onFileInputChange: (e: ComposerFileInputEvent) => void;
  removeFileByIndex: (index: number) => void;

  uploadProgressPercent: number;
  isUploadInProgress: boolean;
} {
  const { disabled, uploadProgress } = options;

  // files — отдельное состояние вложений композера (не связано с текстом сообщения).
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  // Сессия выбора файла: 1 открытие picker = 1 сессия.
  // В рамках одной сессии файлы должны добавиться ровно один раз.
  const fileSelectionSessionRef = useRef<FileSelectionSessionState>({
    sessionId: 0,
    handled: false,
    pendingInputFiles: null,
  });

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

  // Вызывается перед showPicker/click: стартуем новую сессию выбора.
  const beginFileSelectionSession = useCallback(() => {
    fileSelectionSessionRef.current = {
      sessionId: fileSelectionSessionRef.current.sessionId + 1,
      handled: false,
      pendingInputFiles: null,
    };
  }, []);

  // Возвращает активную сессию для события.
  // После завершенной сессии auto-create разрешаем только для change:
  // это позволяет поддержать повторный выбор того же файла без явного клика в тестах/фолбэках,
  // но не запускать новую сессию от "позднего" input-события.
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

  // Коммитит выбранные файлы только один раз для конкретной сессии.
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
        // input сохраняем как pending: change считается основным сигналом,
        // но на платформах без change мы все равно должны добавить файлы.
        fileSelectionSessionRef.current = {
          sessionId,
          handled: false,
          pendingInputFiles: selectedFiles,
        };
        // Даем change шанс сработать первым; если его нет, добавляем файлы из input в microtask.
        Promise.resolve().then(() => {
          const currentSession = fileSelectionSessionRef.current;
          if (currentSession.sessionId !== sessionId || currentSession.handled) return;
          const pendingFiles = currentSession.pendingInputFiles;
          if (pendingFiles == null || pendingFiles.length === 0) return;
          if (!commitSelectionForSession(sessionId, pendingFiles)) return;
          inputElement.value = "";
        });
        return;
      }
      // change коммитим сразу: это финальный сигнал изменения input[type=file].
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
