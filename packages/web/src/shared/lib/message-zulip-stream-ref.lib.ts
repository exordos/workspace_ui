import { type Token, type TokenizerAndRendererExtension, type Tokens } from "marked";

interface ZulipStreamReferenceToken extends Tokens.Generic {
  type: "zulip_stream_reference";
  href?: string;
  htmlClass?: "message-link" | "stream" | "stream-topic";
  text: string;
}

export interface ResolvedStreamReference {
  streamId: number;
  streamName: string;
}

interface ResolvedZulipStreamReference {
  href?: string;
  htmlClass?: "message-link" | "stream" | "stream-topic";
  text: string;
}

const ZULIP_STREAM_REFERENCE_TOKEN_TYPE = "zulip_stream_reference";

function escapeInlineHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttributeText(text: string): string {
  return escapeInlineHtmlText(text).replace(/"/g, "&quot;");
}

function renderZulipStreamReferenceToken(token: Token): string {
  const streamReferenceToken = token as ZulipStreamReferenceToken;
  const text = escapeInlineHtmlText(streamReferenceToken.text);
  if (streamReferenceToken.href == null) {
    return text;
  }
  const className =
    streamReferenceToken.htmlClass != null ? ` class="${streamReferenceToken.htmlClass}"` : "";
  return `<a${className} href="${escapeHtmlAttributeText(streamReferenceToken.href)}">${text}</a>`;
}

export function resolveZulipStreamReference(
  inner: string,
  _resolveStreamByName?: (streamName: string) => ResolvedStreamReference | null,
): ResolvedZulipStreamReference | null {
  const messageMatch = /^([^*>]+)>([^*]*)@(\d+)$/.exec(inner);
  if (messageMatch != null) {
    const streamName = messageMatch[1]?.trim() ?? "";
    const topic = messageMatch[2] ?? "";
    const messageIdRaw = messageMatch[3];
    if (streamName.length === 0 || messageIdRaw == null) {
      return null;
    }
    return {
      htmlClass: "message-link",
      text: `#${streamName}>${topic}@${messageIdRaw}`,
    };
  }

  const topicMatch = /^([^*>]+)>([^*]*)$/.exec(inner);
  if (topicMatch != null) {
    const streamName = topicMatch[1]?.trim() ?? "";
    const topic = topicMatch[2] ?? "";
    if (streamName.length === 0) {
      return null;
    }
    return {
      htmlClass: "stream-topic",
      text: `#${streamName}>${topic}`,
    };
  }

  const streamMatch = /^([^*]+)$/.exec(inner);
  if (streamMatch != null) {
    const streamName = streamMatch[1]?.trim() ?? "";
    if (streamName.length === 0) {
      return null;
    }
    return {
      htmlClass: "stream",
      text: `#${streamName}`,
    };
  }

  return null;
}

export function createZulipStreamReferenceExtension(
  _resolveStreamByName?: (streamName: string) => ResolvedStreamReference | null,
): TokenizerAndRendererExtension {
  return {
    level: "inline",
    name: ZULIP_STREAM_REFERENCE_TOKEN_TYPE,
    start(src) {
      const index = src.indexOf("#**");
      return index >= 0 ? index : undefined;
    },
    tokenizer(src) {
      if (!src.startsWith("#**")) return undefined;
      const match = /^#\*\*([^*]+?)\*\*/.exec(src);
      if (match == null) return undefined;
      const inner = match[1] ?? "";
      const resolved = resolveZulipStreamReference(inner);
      if (resolved == null) return undefined;
      return {
        type: ZULIP_STREAM_REFERENCE_TOKEN_TYPE,
        raw: match[0],
        href: resolved.href,
        htmlClass: resolved.htmlClass,
        text: resolved.text,
      };
    },
    renderer: renderZulipStreamReferenceToken,
  };
}
