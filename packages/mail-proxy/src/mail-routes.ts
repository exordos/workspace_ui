/**
 * REST routes for mail-proxy (/v1/mail/*).
 */

import type { Express, Request, Response } from "express";
import {
  appendMailMessage,
  createMailFolder,
  deleteMailMessage,
  getMailMessage,
  listMailFolders,
  listMailMessages,
  moveMailMessage,
  resolveTrashFolder,
  updateMailMessageFlags,
  verifyImapCredentials,
} from "./mail-imap.lib";
import {
  clearMailMailbox,
  markMailMailboxAllRead,
  moveMailMailbox,
  removeMailMailbox,
  renameMailMailbox,
} from "./mail-folder-ops.lib";
import { mailLog } from "./mail-logger.lib";
import { sendMailMessage } from "./mail-smtp.lib";
import {
  createMailSession,
  deleteMailSession,
  getMailSession,
  parseBearerToken,
} from "./mail-session.lib";
import {
  parseBooleanQuery,
  parseCreateFolderPayload,
  parseFolderPathPayload,
  parseMessageFlagsPayload,
  parseMessageUid,
  parseMoveMailboxPayload,
  parseMoveMailPayload,
  parsePositiveInt,
  parseRenameFolderPayload,
  parseSendMailPayload,
  parseSessionPayload,
  sanitizeFolderPath,
} from "./mail-validation.lib";

const SESSION_RATE_WINDOW_MS = 60_000;
const SESSION_RATE_MAX = 10;
const sessionAttempts = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isSessionRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = sessionAttempts.get(ip);
  if (!entry || now - entry.windowStart > SESSION_RATE_WINDOW_MS) {
    sessionAttempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > SESSION_RATE_MAX;
}

function requireSession(req: Request, res: Response) {
  const token = parseBearerToken(req.headers.authorization);
  const session = getMailSession(token ?? undefined);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

function handleError(res: Response, error: unknown, fallbackMessage: string): void {
  const message = error instanceof Error ? error.message : fallbackMessage;
  mailLog.warn(fallbackMessage, { error: message });
  res.status(400).json({ error: message });
}

export function registerMailRoutes(app: Express): void {
  app.post("/v1/mail/session", async (req, res) => {
    const ip = getClientIp(req);
    if (isSessionRateLimited(ip)) {
      res.status(429).json({ error: "Too many login attempts" });
      return;
    }
    try {
      const { email, password } = parseSessionPayload(req.body);
      await verifyImapCredentials(email, password);
      const session = createMailSession(email, password);
      res.json({
        sessionToken: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        email: session.email,
      });
    } catch (error) {
      handleError(res, error, "Mail login failed");
    }
  });

  app.delete("/v1/mail/session", (req, res) => {
    const token = parseBearerToken(req.headers.authorization);
    deleteMailSession(token ?? undefined);
    res.status(204).end();
  });

  app.get("/v1/mail/folders", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const { folders, delimiter } = await listMailFolders(session);
      res.json({ folders, delimiter });
    } catch (error) {
      handleError(res, error, "Failed to list folders");
    }
  });

  app.post("/v1/mail/folders", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const { path } = parseCreateFolderPayload(req.body);
      await createMailFolder(session, path);
      res.status(201).json({ ok: true, path });
    } catch (error) {
      handleError(res, error, "Failed to create folder");
    }
  });

  app.patch("/v1/mail/folders", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const { path, name, delimiter } = parseRenameFolderPayload(req.body);
      const newPath = await renameMailMailbox(session, path, name, delimiter);
      res.json({ ok: true, path: newPath });
    } catch (error) {
      handleError(res, error, "Failed to rename folder");
    }
  });

  app.post("/v1/mail/folders/move", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const { path, parentPath, delimiter } = parseMoveMailboxPayload(req.body);
      const newPath = await moveMailMailbox(session, path, parentPath, delimiter);
      res.json({ ok: true, path: newPath });
    } catch (error) {
      handleError(res, error, "Failed to move folder");
    }
  });

  app.delete("/v1/mail/folders", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const folderPath =
        typeof req.query.path === "string"
          ? sanitizeFolderPath(req.query.path)
          : parseFolderPathPayload(req.body).path;
      const delimiter =
        typeof req.query.delimiter === "string" && req.query.delimiter.length === 1
          ? req.query.delimiter
          : ".";
      await removeMailMailbox(session, folderPath, delimiter);
      res.status(204).end();
    } catch (error) {
      handleError(res, error, "Failed to delete folder");
    }
  });

  app.post("/v1/mail/folders/clear", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const { path } = parseFolderPathPayload(req.body);
      await clearMailMailbox(session, path);
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, "Failed to clear folder");
    }
  });

  app.post("/v1/mail/folders/mark-all-read", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const { path } = parseFolderPathPayload(req.body);
      await markMailMailboxAllRead(session, path);
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, "Failed to mark folder as read");
    }
  });

  app.get("/v1/mail/messages", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const folder = sanitizeFolderPath(typeof req.query.folder === "string" ? req.query.folder : "INBOX");
      const limit = parsePositiveInt(
        typeof req.query.limit === "string" ? req.query.limit : undefined,
        50,
        100,
      );
      const cursorRaw = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const cursorUid = cursorRaw != null && cursorRaw.length > 0 ? parseMessageUid(cursorRaw) : null;
      const messages = await listMailMessages(session, folder, limit, cursorUid);
      const nextCursor = messages.length > 0 ? String(messages[messages.length - 1]!.uid) : null;
      res.json({ folder, messages, nextCursor });
    } catch (error) {
      handleError(res, error, "Failed to list messages");
    }
  });

  app.get("/v1/mail/messages/:uid", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const folder = sanitizeFolderPath(typeof req.query.folder === "string" ? req.query.folder : "INBOX");
      const uid = parseMessageUid(req.params.uid ?? "");
      const markSeen = parseBooleanQuery(
        typeof req.query.markSeen === "string" ? req.query.markSeen : undefined,
        true,
      );
      const message = await getMailMessage(session, folder, uid, { markSeen });
      if (!message) {
        res.status(404).json({ error: "Message not found" });
        return;
      }
      res.json({ message });
    } catch (error) {
      handleError(res, error, "Failed to fetch message");
    }
  });

  app.patch("/v1/mail/messages/:uid", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const uid = parseMessageUid(req.params.uid ?? "");
      const { folder, addFlags, removeFlags } = parseMessageFlagsPayload(req.body);
      await updateMailMessageFlags(session, folder, uid, {
        add: addFlags,
        remove: removeFlags,
      });
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, "Failed to update message flags");
    }
  });

  app.delete("/v1/mail/messages/:uid", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const folder = sanitizeFolderPath(typeof req.query.folder === "string" ? req.query.folder : "INBOX");
      const uid = parseMessageUid(req.params.uid ?? "");
      const trashFolder = await resolveTrashFolder(session);
      await deleteMailMessage(session, folder, uid, trashFolder);
      res.status(204).end();
    } catch (error) {
      handleError(res, error, "Failed to delete message");
    }
  });

  app.post("/v1/mail/messages/:uid/move", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const uid = parseMessageUid(req.params.uid ?? "");
      const { fromFolder, toFolder } = parseMoveMailPayload(req.body);
      await moveMailMessage(session, fromFolder, toFolder, uid);
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, "Failed to move message");
    }
  });

  app.post("/v1/mail/messages", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const payload = parseSendMailPayload(req.body);
      await sendMailMessage(session, payload);
      res.status(201).json({ ok: true });
    } catch (error) {
      handleError(res, error, "Failed to send message");
    }
  });
}
