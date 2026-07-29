export interface RightPanelUserProfileEditAvatarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Есть ли сейчас фото — без него пункт удаления disabled. */
  hasAvatar: boolean;
  /** Идёт upload/remove — блокируем действия. */
  busy?: boolean;
  /** Сообщение об ошибке последней операции (unsupported и т.п.). */
  error?: string | null;
  /**
   * "Take photo" stays hidden until camera support is implemented.
   * Keep the callback so the action can be restored without changing the dialog contract.
   */
  onTakePhoto?: () => void;
  onChooseFromGallery: () => void;
  onRemoveCurrentPhoto: () => void;
}
