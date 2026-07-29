export interface RightPanelUserProfileEditAvatarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Есть ли сейчас фото — без него пункт удаления disabled. */
  hasAvatar: boolean;
  /** Идёт upload/remove — блокируем действия. */
  busy?: boolean;
  /** Сообщение об ошибке последней операции (unsupported и т.п.). */
  error?: string | null;
  onTakePhoto: () => void;
  onChooseFromGallery: () => void;
  onRemoveCurrentPhoto: () => void;
}
