import multer from "multer";
import { getStreamIdByName } from "./streams";
import type { Express, Request, Response } from "express";

const formParser = multer();

interface MockReaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: string;
  user_id: number;
}

interface MockMessage {
  id: number;
  sender_id: number;
  sender_full_name: string;
  stream_id: number | null;
  channel?: string;
  subject: string;
  content: string;
  timestamp: number;
  reactions?: MockReaction[];
}

const now = Math.floor(Date.now() / 1000);

const SENDER_POOL = [
  { id: 1, name: "Ilya Fomin" },
  { id: 2, name: "Daria Isakova" },
  { id: 4, name: "Anna Designer" },
  { id: 5, name: "Michael Product" },
  { id: 6, name: "Kate QA" },
  { id: 7, name: "Sergey DevOps" },
  { id: 8, name: "Alex Analyst" },
  { id: 9, name: "Marina Support" },
  { id: 10, name: "Oleg Marketing" },
] as const;

const CONTENT_SAMPLES = [
  "Agreed, let's do it that way.",
  "We can discuss at standup.",
  "Done, please check in dev environment.",
  "Question about the mockup — when do you have time?",
  "I'll remind you on Thursday.",
  "Added to backlog.",
  "Already in progress.",
  "Has anyone looked at the latest commit?",
  "Suggest moving to next week.",
  "Great idea 👍",
  "Need help with tests.",
  "Updated the documentation.",
  "Don't forget the 3pm meeting.",
  "Please check on mobile.",
  "I'll send the link in DM.",
  "Will finish by end of day.",
  "There's an API blocker.",
  "We can close the ticket.",
  "Who's leading retro?",
  "Reply in the thread if anything.",
];

const TOPIC_SAMPLES = ["Welcome", "Design", "Roadmap", "Testing", "General", "Questions", "Ideas"];

function generateManyMessages(
  streamId: number,
  channel: string,
  startTs: number,
  endTs: number,
  count: number,
  startId: number
): MockMessage[] {
  const out: MockMessage[] = [];
  const step = Math.max(1, Math.floor((endTs - startTs) / count));
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    const sender = SENDER_POOL[i % SENDER_POOL.length];
    const topic = TOPIC_SAMPLES[i % TOPIC_SAMPLES.length];
    out.push({
      id,
      sender_id: sender.id,
      sender_full_name: sender.name,
      stream_id: streamId,
      channel,
      subject: topic,
      content: CONTENT_SAMPLES[i % CONTENT_SAMPLES.length],
      timestamp: startTs + i * step,
    });
  }
  return out;
}

// Mutable store so POST can add messages
const messages: MockMessage[] = [
  // general
  {
    id: 1001,
    sender_id: 1,
    sender_full_name: "Ilya Fomin",
    stream_id: 10,
    channel: "general",
    subject: "Welcome",
    content: "Welcome to the custom Zulip client 👋",
    timestamp: now - 3600,
    reactions: [
      { emoji_name: "thumbs_up", emoji_code: "1f44d", reaction_type: "unicode_emoji", user_id: 999 },
      { emoji_name: "thumbs_up", emoji_code: "1f44d", reaction_type: "unicode_emoji", user_id: 1 },
      { emoji_name: "heart", emoji_code: "2764-fe0f", reaction_type: "unicode_emoji", user_id: 2 },
    ],
  },
  {
    id: 1002,
    sender_id: 2,
    sender_full_name: "Daria Isakova",
    stream_id: 10,
    channel: "general",
    subject: "Design",
    content:
      "Uploaded new mockup to Figma: version with channel info on the right. Need to implement it as close as possible.",
    timestamp: now - 3500,
    reactions: [
      { emoji_name: "heart", emoji_code: "2764-fe0f", reaction_type: "unicode_emoji", user_id: 4 },
    ],
  },
  {
    id: 1003,
    sender_id: 4,
    sender_full_name: "Anna Designer",
    stream_id: 10,
    channel: "general",
    subject: "Design",
    content: "Updated spacing and grid. Please check in Dev mode.",
    timestamp: now - 3400,
  },
  {
    id: 1004,
    sender_id: 5,
    sender_full_name: "Michael Product",
    stream_id: 10,
    channel: "general",
    subject: "Roadmap",
    content:
      "This week focus on custom Zulip web client and integration with our OIDC.",
    timestamp: now - 3200,
  },
  {
    id: 1005,
    sender_id: 6,
    sender_full_name: "Kate QA",
    stream_id: 10,
    channel: "general",
    subject: "Testing",
    content:
      "Added checklist for auth and navigation testing. Will add scenarios for real-time updates later.",
    timestamp: now - 3000,
  },
  {
    id: 1006,
    sender_id: 999,
    sender_full_name: "You",
    stream_id: 10,
    channel: "general",
    subject: "Welcome",
    content: "Thanks, connecting the message list and right panel.",
    timestamp: now - 2900,
  },
  {
    id: 1007,
    sender_id: 999,
    sender_full_name: "You",
    stream_id: 10,
    channel: "general",
    subject: "Design",
    content: "Reviewed the mockup, working on the channel info panel.",
    timestamp: now - 2700,
  },
  // More messages in general for scroll testing (approx. 3 days)
  ...generateManyMessages(10, "general", now - 86400 * 3, now - 3000, 120, 5000),
  // engineering
  {
    id: 1101,
    sender_id: 7,
    sender_full_name: "Sergey DevOps",
    stream_id: 11,
    channel: "engineering",
    subject: "Mock server",
    content:
      "Mock server running at http://localhost:4000. Currently has /users, /streams, /messages with fixtures.",
    timestamp: now - 2500,
  },
  {
    id: 1102,
    sender_id: 1,
    sender_full_name: "Ilya Fomin",
    stream_id: 11,
    channel: "engineering",
    subject: "API client",
    content:
      "Frontend currently uses mock-server, will switch to zulip-js and real API later.",
    timestamp: now - 2300,
  },
  {
    id: 1103,
    sender_id: 2,
    sender_full_name: "Daria Isakova",
    stream_id: 11,
    channel: "engineering",
    subject: "Layout",
    content:
      "Remember layout must be responsive while matching the desktop mockup 1920×1080.",
    timestamp: now - 2100,
  },
  {
    id: 1104,
    sender_id: 999,
    sender_full_name: "You",
    stream_id: 11,
    channel: "engineering",
    subject: "API client",
    content: "Using mock for now, will switch to zulip-js later.",
    timestamp: now - 2000,
  },
  // design
  {
    id: 1201,
    sender_id: 4,
    sender_full_name: "Anna Designer",
    stream_id: 12,
    channel: "design",
    subject: "SVG assets",
    content:
      "Exported main icons to SVG. They need to be wired up as separate components.",
    timestamp: now - 2000,
  },
  {
    id: 1202,
    sender_id: 4,
    sender_full_name: "Anna Designer",
    stream_id: 12,
    channel: "design",
    subject: "Right panel",
    content:
      "Right panel has blocks: media, links, comments with calls, and participants. Can be static for now.",
    timestamp: now - 1800,
  },
  {
    id: 1203,
    sender_id: 999,
    sender_full_name: "You",
    stream_id: 12,
    channel: "design",
    subject: "SVG assets",
    content: "Icons wired up as React components via Icon.",
    timestamp: now - 1700,
  },
  // product
  {
    id: 1301,
    sender_id: 5,
    sender_full_name: "Michael Product",
    stream_id: 13,
    channel: "product",
    subject: "Navigation",
    content:
      "After the first chat page we'll add top-level navigation: chat list, settings, etc.",
    timestamp: now - 1500,
  },
  // support
  {
    id: 1401,
    sender_id: 9,
    sender_full_name: "Marina Support",
    stream_id: 14,
    channel: "support",
    subject: "Feedback",
    content:
      "Users are asking for dark theme and compact message mode. Let's discuss how to fit this into our UI.",
    timestamp: now - 1200,
  },
  {
    id: 1402,
    sender_id: 8,
    sender_full_name: "Alex Analyst",
    stream_id: 14,
    channel: "support",
    subject: "Metrics",
    content:
      "Collecting chat usage metrics. We can embed charts in the right panel later.",
    timestamp: now - 900,
  },
  // random
  {
    id: 1501,
    sender_id: 10,
    sender_full_name: "Oleg Marketing",
    stream_id: 15,
    channel: "random",
    subject: "Off-topic",
    content: "Who's going to the React 19 meetup on Thursday?",
    timestamp: now - 800,
  },
  {
    id: 1502,
    sender_id: 6,
    sender_full_name: "Kate QA",
    stream_id: 15,
    channel: "random",
    subject: "Off-topic",
    content: "I'll be there, we can discuss testing real-time clients.",
    timestamp: now - 700,
  },
  {
    id: 1503,
    sender_id: 999,
    sender_full_name: "You",
    stream_id: 15,
    channel: "random",
    subject: "Off-topic",
    content: "I signed up too, see you Thursday.",
    timestamp: now - 600,
  },
];

// Direct messages: dm_id matches sidebar id (101, 102, 103, 104)
const dmMessages: Record<number, MockMessage[]> = {
  101: [
    {
      id: 2001,
      sender_id: 1,
      sender_full_name: "Ilya Fomin",
      stream_id: null,
      subject: "",
      content: "Hi! How's the chat layout progressing?",
      timestamp: now - 7200,
    },
    {
      id: 2002,
      sender_id: 999,
      sender_full_name: "You",
      stream_id: null,
      subject: "",
      content: "Working on the message list and scroll-to-bottom on switch.",
      timestamp: now - 7000,
    },
    {
      id: 2003,
      sender_id: 1,
      sender_full_name: "Ilya Fomin",
      stream_id: null,
      subject: "",
      content: "Great, we'll see the first version by end of week.",
      timestamp: now - 6800,
      reactions: [
        { emoji_name: "thumbs_up", emoji_code: "1f44d", reaction_type: "unicode_emoji", user_id: 999 },
      ],
    },
  ],
  102: [
    {
      id: 2101,
      sender_id: 2,
      sender_full_name: "Daria Isakova",
      stream_id: null,
      subject: "",
      content: "We agreed in the group: design meeting Wednesday at 3pm.",
      timestamp: now - 5400,
    },
    {
      id: 2102,
      sender_id: 4,
      sender_full_name: "Anna Designer",
      stream_id: null,
      subject: "",
      content: "Confirmed, I'll have the mockups.",
      timestamp: now - 5300,
    },
    {
      id: 2103,
      sender_id: 999,
      sender_full_name: "You",
      stream_id: null,
      subject: "",
      content: "I'll sign up, thanks.",
      timestamp: now - 5200,
    },
  ],
  103: [
    {
      id: 2201,
      sender_id: 2,
      sender_full_name: "Daria Isakova",
      stream_id: null,
      subject: "",
      content: "Ok, then Thursday works?",
      timestamp: now - 86400,
    },
    {
      id: 2202,
      sender_id: 999,
      sender_full_name: "You",
      stream_id: null,
      subject: "",
      content: "Yes, Thursday works. I'll message the day before.",
      timestamp: now - 86000,
    },
  ],
  104: [
    {
      id: 2301,
      sender_id: 5,
      sender_full_name: "Michael Product",
      stream_id: null,
      subject: "",
      content: "Reminder: meeting at 3pm about the custom client.",
      timestamp: now - 3600,
    },
    {
      id: 2302,
      sender_id: 999,
      sender_full_name: "You",
      stream_id: null,
      subject: "",
      content: "I'll be there, preparing a demo on navigation.",
      timestamp: now - 3500,
    },
  ],
};

function nextId(): number {
  const ids = messages.map((m) => m.id);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function nextDmId(): number {
  const allDm = Object.values(dmMessages).flat();
  const ids = allDm.map((m) => m.id);
  return ids.length ? Math.max(...ids) + 1 : 3000;
}

export function getTopicsByStream(streamName: string): string[] {
  const seen = new Set<string>();
  messages
    .filter((m) => m.channel === streamName)
    .forEach((m) => seen.add(m.subject));
  return Array.from(seen).sort();
}

/** Zulip API message format (GET /messages) */
function toZulipMessage(m: MockMessage): Record<string, unknown> {
  return {
    id: m.id,
    sender_id: m.sender_id,
    sender_full_name: m.sender_full_name,
    content: m.content,
    timestamp: m.timestamp,
    display_recipient: m.channel ?? "",
    subject: m.subject,
    type: m.stream_id !== null ? "stream" : "private",
    stream_id: m.stream_id ?? undefined,
    channel: m.channel,
    reactions: m.reactions ?? [],
  };
}

/** Parse narrow from Zulip API: [{"operator":"stream","operand":"general"},{"operator":"topic","operand":"Design"}] or dm */
function filterByNarrow(
  list: MockMessage[],
  narrow: unknown[]
): MockMessage[] {
  let out = list;
  for (const term of narrow) {
    if (!term || typeof term !== "object" || !("operator" in term) || !("operand" in term)) continue;
    const op = (term as { operator: string; operand: unknown }).operator;
    const operand = (term as { operator: string; operand: unknown }).operand;
    if (op === "stream" || op === "channel") {
      const name = typeof operand === "string" ? operand : String(operand);
      out = out.filter((m) => m.channel === name);
    } else if (op === "topic") {
      const name = typeof operand === "string" ? operand : String(operand);
      out = out.filter((m) => m.subject === name);
    } else if (op === "dm" || op === "pm-with") {
      const dmId = typeof operand === "number" ? operand : Array.isArray(operand) ? operand[0] : parseInt(String(operand), 10);
      if (!Number.isNaN(dmId) && dmId > 0) {
        out = dmMessages[dmId] ?? [];
      }
    } else if (op === "search") {
      const q = typeof operand === "string" ? operand : String(operand);
      if (q.trim()) {
        const lower = q.trim().toLowerCase();
        out = out.filter(
          (m) =>
            m.content.toLowerCase().includes(lower) ||
            (m.subject && m.subject.toLowerCase().includes(lower))
        );
      }
    } else if (op === "has" && operand === "reaction") {
      out = out.filter((m) => (m.reactions?.length ?? 0) > 0);
    } else if (op === "sender") {
      const senderId =
        typeof operand === "number" ? operand : parseInt(String(operand), 10);
      if (!Number.isNaN(senderId)) {
        out = out.filter((m) => m.sender_id === senderId);
      }
    } else if (op === "is") {
      const flag = typeof operand === "string" ? operand : String(operand);
      if (flag === "starred" || flag === "mentioned") {
        out = out.filter((m) => {
          const flags = (m as MockMessage & { flags?: string[] }).flags ?? [];
          return flags.includes(flag);
        });
      }
    }
  }
  return out;
}

export function registerMessagesRoutes(app: Express, apiBase: string) {
  // Deprecated endpoint for topics by stream name (can remove when migrated to users/me/:id/topics)
  app.get(`${apiBase}/messages/topics`, (req: Request, res: Response) => {
    const { stream } = req.query;
    if (typeof stream !== "string") {
      res.status(400).json({ result: "error", msg: "stream required" });
      return;
    }
    res.json({
      result: "success",
      msg: "",
      topics: getTopicsByStream(stream),
    });
  });

  // GET /messages — Zulip API: narrow (JSON), anchor, num_before, num_after
  app.get(`${apiBase}/messages`, (req: Request, res: Response) => {
    const { narrow: narrowRaw, anchor, num_before, num_after, message_ids: messageIdsRaw } =
      req.query;

    if (typeof messageIdsRaw === "string" && messageIdsRaw.trim().length > 0) {
      let requestedIds: number[] = [];
      try {
        const parsed = JSON.parse(messageIdsRaw) as unknown;
        if (Array.isArray(parsed)) {
          requestedIds = parsed.filter(
            (value): value is number => typeof value === "number" && Number.isInteger(value),
          );
        }
      } catch {
        requestedIds = [];
      }
      const idSet = new Set(requestedIds);
      const matched = messages
        .filter((message) => idSet.has(message.id))
        .sort((left, right) => left.id - right.id)
        .map(toZulipMessage);
      res.json({
        result: "success",
        msg: "",
        messages: matched,
      });
      return;
    }
    const numBefore = Math.min(Math.max(0, parseInt(String(num_before), 10) || 50), 5000);
    const numAfter = Math.min(Math.max(0, parseInt(String(num_after), 10) || 0), 5000);

    let narrow: unknown[] = [];
    if (typeof narrowRaw === "string") {
      try {
        narrow = JSON.parse(narrowRaw) as unknown[];
        if (!Array.isArray(narrow)) narrow = [];
      } catch {
        narrow = [];
      }
    }

    const isDmNarrow = narrow.some(
      (t) => t && typeof t === "object" && "operator" in t && ((t as { operator: string }).operator === "dm" || (t as { operator: string }).operator === "pm-with")
    );
    const list = isDmNarrow
      ? (() => {
          const dmTerm = narrow.find(
            (t) => t && typeof t === "object" && "operator" in t && ("operand" in t) && ((t as { operator: string }).operator === "dm" || (t as { operator: string }).operator === "pm-with")
          ) as { operand: number | number[] } | undefined;
          const operand = dmTerm?.operand;
          const dmId = typeof operand === "number" ? operand : Array.isArray(operand) ? operand[0] : NaN;
          return dmMessages[Number.isNaN(dmId) ? 0 : dmId] ?? [];
        })()
      : filterByNarrow(messages, narrow);

    const sorted = [...list].sort((a, b) => a.id - b.id);
    const anchorVal = anchor === "newest" || anchor === "last" ? "newest" : String(anchor ?? "newest");
    let startIdx = sorted.length - 1;
    if (anchorVal === "newest" || anchorVal === "last") {
      startIdx = sorted.length - 1;
    } else if (anchorVal === "oldest" || anchorVal === "first") {
      startIdx = 0;
    } else {
      const anchorId = parseInt(anchorVal, 10);
      if (!Number.isNaN(anchorId)) {
        const found = sorted.findIndex((m) => m.id === anchorId);
        startIdx = found >= 0 ? found : sorted.length - 1;
      }
    }
    const beforeStart = Math.max(0, startIdx - numBefore);
    const afterEnd = Math.min(sorted.length, startIdx + numAfter + 1);
    const slice = sorted.slice(beforeStart, afterEnd);
    const zulipMessages = slice.map(toZulipMessage);

    res.json({
      result: "success",
      msg: "",
      messages: zulipMessages,
      found_newest: afterEnd >= sorted.length,
      found_oldest: beforeStart <= 0,
      anchor: slice[Math.min(numBefore, slice.length - 1)]?.id ?? sorted[sorted.length - 1]?.id,
    });
  });

  // POST /messages — Zulip API: type, to, topic, content (form, multipart or JSON)
  app.post(`${apiBase}/messages`, formParser.none(), (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const type = String(body.type ?? "stream").toLowerCase();
    const to = body.to;
    const topic = typeof body.topic === "string" ? body.topic : "general";
    const content = typeof body.content === "string" ? body.content : "";

    if (!content.trim()) {
      res.status(400).json({ result: "error", msg: "content required" });
      return;
    }

    if (type === "stream" || type === "channel") {
      const streamName = typeof to === "string" ? to : Array.isArray(to) ? String(to[0]) : String(to);
      const streamId = getStreamIdByName(streamName);
      const newMsg: MockMessage = {
        id: nextId(),
        sender_id: 999,
        sender_full_name: "You",
        stream_id: streamId,
        channel: streamName,
        subject: topic || "general",
        content: content.trim(),
        timestamp: Math.floor(Date.now() / 1000),
      };
      messages.push(newMsg);
      res.status(201).json({
        result: "success",
        msg: "",
        id: newMsg.id,
      });
      return;
    }

    if (type === "direct" || type === "private") {
      const toArr = Array.isArray(to)
        ? (to as unknown[]).map((x) => (typeof x === "number" ? x : parseInt(String(x), 10))).filter((n) => !Number.isNaN(n))
        : typeof to === "number"
          ? [to]
          : [parseInt(String(to), 10)].filter((n) => !Number.isNaN(n));
      if (toArr.length === 0) {
        res.status(400).json({ result: "error", msg: "private message requires to (user id or array)" });
        return;
      }
      const dmId = toArr[0];
      if (!dmMessages[dmId]) {
        dmMessages[dmId] = [];
      }
      const newMsg: MockMessage = {
        id: nextDmId(),
        sender_id: 999,
        sender_full_name: "You",
        stream_id: null,
        subject: "",
        content: content.trim(),
        timestamp: Math.floor(Date.now() / 1000),
      };
      dmMessages[dmId].push(newMsg);
      res.status(201).json({
        result: "success",
        msg: "",
        id: newMsg.id,
      });
      return;
    }

    res.status(400).json({ result: "error", msg: "type must be stream or direct" });
  });
}

