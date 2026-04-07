import { useEffect, useRef, useState } from "react";
import type { MockMessage } from "~/shared/api/zulip";
import { fetchMessageById } from "~/shared/api/zulip";

export function useChatForwardHydration(options: {
  forwardMessageId: number | null;
  messages: MockMessage[];
}): {
  forwardMessages: MockMessage[];
  setForwardMessages: React.Dispatch<React.SetStateAction<MockMessage[]>>;
  forwardSelectedText: string | undefined;
  setForwardSelectedText: React.Dispatch<React.SetStateAction<string | undefined>>;
} {
  const { forwardMessageId, messages } = options;

  const [forwardMessages, setForwardMessages] = useState<MockMessage[]>([]);
  const [forwardSelectedText, setForwardSelectedText] = useState<string | undefined>(undefined);
  const processedForwardMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (forwardMessageId == null) {
      processedForwardMessageIdRef.current = null;
      return;
    }

    const messageFromCurrentChat = messages.find((message) => message.id === forwardMessageId);
    if (messageFromCurrentChat != null) {
      processedForwardMessageIdRef.current = forwardMessageId;
      setForwardMessages([messageFromCurrentChat]);
      setForwardSelectedText(undefined);
      return;
    }

    if (processedForwardMessageIdRef.current === forwardMessageId) {
      return;
    }
    processedForwardMessageIdRef.current = forwardMessageId;

    let cancelled = false;
    fetchMessageById(forwardMessageId)
      .then((message) => {
        if (cancelled || message == null) return;
        setForwardMessages([message]);
        setForwardSelectedText(undefined);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [forwardMessageId, messages]);

  return { forwardMessages, setForwardMessages, forwardSelectedText, setForwardSelectedText };
}

