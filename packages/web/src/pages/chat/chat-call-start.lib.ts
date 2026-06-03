import type { MockMessage } from "~/shared/api/zulip.types";
import { canStartCallFromHeader, type CallMessageTargetParams } from "./chat-call.lib";

export interface StartCallFromHeaderInput {
  target: CallMessageTargetParams | null;
  currentUserId: number | null;
  buildCurrentCallLink: () => string | null;
  isOneToOneDm: boolean;
  callRoomChatLabel: string | null;
  fallbackDmPartnerLabel: string;
  currentUserLabel: string;
  sendMessage: (
    payload:
      | {
          to: number[];
          content: string;
          sender_id: number;
          sender_full_name: string;
        }
      | {
          stream: string;
          streamId?: number;
          subject: string;
          content: string;
          sender_id: number;
          sender_full_name: string;
        },
  ) => Promise<MockMessage>;
  appendMessageToStore: (message: MockMessage) => void;
  openModal: (url: string, locationName: string) => void;
  resolveErrorMessage: (error: unknown) => string;
}

export interface StartCallFromHeaderResult {
  ok: boolean;
  error: string | null;
}

/**
 * Header call start: send call message, then auto-open modal for 1:1 DMs after success.
 */
export async function startCallFromHeader(
  input: StartCallFromHeaderInput,
): Promise<StartCallFromHeaderResult> {
  if (!canStartCallFromHeader({ target: input.target, currentUserId: input.currentUserId })) {
    return { ok: false, error: null };
  }

  const url = input.buildCurrentCallLink();
  if (url == null || input.target == null || input.currentUserId == null) {
    return { ok: false, error: null };
  }

  try {
    const payload =
      input.target.mode === "dm"
        ? {
            to: input.target.to,
            content: url,
            sender_id: input.currentUserId,
            sender_full_name: input.currentUserLabel,
          }
        : {
            stream: input.target.stream,
            streamId: input.target.streamId,
            subject: input.target.subject,
            content: url,
            sender_id: input.currentUserId,
            sender_full_name: input.currentUserLabel,
          };

    const newMessage = await input.sendMessage(payload);
    input.appendMessageToStore(newMessage);

    // Auto-open strictly for 1:1 DMs only.
    if (input.isOneToOneDm) {
      input.openModal(url, input.callRoomChatLabel ?? input.fallbackDmPartnerLabel);
    }

    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: input.resolveErrorMessage(error) };
  }
}
