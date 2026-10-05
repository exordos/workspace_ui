import type { ReactNode } from "react";

export type EncryptedChatInfoScreen = "info" | "settings" | "key";

export interface EncryptedChatKeyInfo {
  readonly name: string;
  readonly createdLabel?: string;
}

export interface EncryptedChatKeyRequestView {
  readonly requestMessageUuid: string;
  readonly name: string;
  readonly deviceName: string;
  readonly avatarUrl?: string | null;
  readonly pending?: boolean;
  readonly canGrant: boolean;
  readonly canReject: boolean;
  readonly error?: string | null;
}

export interface EncryptedChatMemberView {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string | null;
  readonly statusLabel?: string | null;
  readonly roleLabel?: string | null;
}

/** Display data and capabilities are resolved by the owning chat controller. */
export interface EncryptedChatInfoProps {
  readonly title: string;
  readonly participantsCount: number;
  readonly onlineCount: number;
  readonly keyInfo: EncryptedChatKeyInfo | null;
  readonly requests: readonly EncryptedChatKeyRequestView[];
  readonly members: readonly EncryptedChatMemberView[];
  readonly renderAvatar?: (
    person: Pick<EncryptedChatMemberView, "name" | "avatarUrl">,
  ) => ReactNode;
  readonly requestsLabel?: string;
  readonly unavailableReason?: string;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly actionsPending?: boolean;
  readonly showKeyManagement?: boolean;
  readonly screen?: EncryptedChatInfoScreen;
  readonly description?: string;
  readonly channelTypeLabel?: string;
  readonly onScreenChange?: (screen: EncryptedChatInfoScreen) => void;
  readonly grantedRequests?: readonly EncryptedChatKeyRequestView[];
  readonly rejectedRequests?: readonly EncryptedChatKeyRequestView[];

  readonly canRotateKey?: boolean;
  readonly canGrantAll?: boolean;
  readonly onClose?: () => void;
  readonly onCopyKey?: () => void;
  readonly onRotateKey?: () => void;
  readonly onGrantAll?: () => void;
  readonly onGrantRequest?: (requestMessageUuid: string) => void;
  readonly onRejectRequest?: (requestMessageUuid: string) => void;
  readonly onOpenSettings?: () => void;
  readonly onCall?: () => void;
  readonly onAddMember?: () => void;
}
