import type { PresenceVisual } from "~/shared/ui/presence-indicator";
import type { ReactNode } from "react";

export type EncryptedChatInfoScreen = "info" | "settings" | "key" | "local-key";

export interface EncryptedChatKeyInfo {
  readonly name: string;
  readonly createdLabel?: string;
}

export interface EncryptedChatLocalKeyView {
  readonly keyUuid: string;
  readonly isCurrent: boolean;
  readonly addedLabel: string;
  readonly announcedLabel: string;
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
  readonly email?: string | null;
  readonly presence?: PresenceVisual;
  readonly statusLabel?: string | null;
  readonly roleLabel?: string | null;
}

/** Display data and capabilities are resolved by the owning chat controller. */
export interface EncryptedChatInfoProps {
  readonly title: string;
  readonly color?: number | null;
  readonly participantsCount: number;
  readonly onlineCount: number;
  readonly keyInfo: EncryptedChatKeyInfo | null;
  readonly requests: readonly EncryptedChatKeyRequestView[];
  readonly members: readonly EncryptedChatMemberView[];
  readonly renderAvatar?: (
    person: Pick<EncryptedChatMemberView, "name" | "avatarUrl" | "presence">,
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

  readonly localKeys?: readonly EncryptedChatLocalKeyView[];
  readonly localKeysLoading?: boolean;
  readonly localKeysError?: string | null;
  readonly selectedLocalKeyUuid?: string;
  readonly currentKeyMissing?: boolean;
  readonly canRequestKey?: boolean;
  readonly requestedKeyUuid?: string;
  readonly onOpenLocalKey?: (keyUuid: string) => void;
  readonly onRequestKey?: (keyUuid: string) => void;
  readonly onDeleteLocalKey?: (keyUuid: string) => void;
  readonly onRetryLocalKeys?: () => void;

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
  readonly onRemoveMember?: (memberId: string) => void;
  readonly removableMemberIds?: readonly string[];
  readonly removingMemberIds?: readonly string[];
  readonly removeMemberError?: string | null;
}
