import { useEffect, useRef, useState } from "react";

export interface ChatForwardHydrationMessage {
  id: number;
}

export function useChatForwardHydration(options: {
  forwardMessageId: number | null;
  messages: ChatForwardHydrationMessage[];
}): {
  forwardMessages: ChatForwardHydrationMessage[];
  setForwardMessages: React.Dispatch<React.SetStateAction<ChatForwardHydrationMessage[]>>;
  forwardSelectedText: string | undefined;
  setForwardSelectedText: React.Dispatch<React.SetStateAction<string | undefined>>;
} {
  const { forwardMessageId, messages } = options;

  const [forwardMessages, setForwardMessages] = useState<ChatForwardHydrationMessage[]>([]);
  const [forwardSelectedText, setForwardSelectedText] = useState<string | undefined>(undefined);
  const hydratedForwardMessageIdRef = useRef<number | null>(null);
  const missingForwardMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (forwardMessageId == null) {
      hydratedForwardMessageIdRef.current = null;
      missingForwardMessageIdRef.current = null;
      return;
    }

    const messageFromCurrentChat = messages.find((message) => message.id === forwardMessageId);
    if (messageFromCurrentChat != null) {
      if (hydratedForwardMessageIdRef.current === forwardMessageId) {
        return;
      }
      hydratedForwardMessageIdRef.current = forwardMessageId;
      missingForwardMessageIdRef.current = null;
      setForwardMessages([messageFromCurrentChat]);
      setForwardSelectedText(undefined);
      return;
    }

    if (missingForwardMessageIdRef.current === forwardMessageId) {
      return;
    }
    missingForwardMessageIdRef.current = forwardMessageId;
    hydratedForwardMessageIdRef.current = null;
    setForwardMessages([]);
    setForwardSelectedText(undefined);
  }, [forwardMessageId, messages]);

  return { forwardMessages, setForwardMessages, forwardSelectedText, setForwardSelectedText };
}
