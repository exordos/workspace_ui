/**
 * REST routes for mail-proxy (/v1/mail/*) — IMAP/SMTP transport only.
 */

import type { Express } from "express";
import { handleRouteError } from "../shared/http/error-handler.lib";
import {
  getClientIp,
  isSessionRateLimited,
  requireMailSession,
} from "../shared/session/session-auth.lib";
import {
  createMailSession,
  deleteMailSession,
  parseBearerToken,
} from "../shared/session/session.lib";
import {
  createMailFolder,
  clearMailFolder,
  deleteMailFolder,
  deleteMailMessage,
  getMailMessage,
  listMailFolders,
  listMailMessages,
  markAllMailFolderRead,
  moveMailMessage,
  renameMailFolder,
  resolveTrashFolder,
  updateMailMessageFlags,
  verifyImapCredentials,
} from "./imap.lib";
import {
  parseBooleanQuery,
  parseFolderMoveBody,
  parseFolderPathBody,
  parseMessageFlagsBody,
  parseMessageUid,
  parseMoveMailBody,
  parsePositiveInt,
  parseSendMailBody,
  parseSessionBody,
  sanitizeFolderPath,
} from "./request.lib";
import { sendMailMessage } from "./smtp.lib";

export function registerMailRoutes(app: Express): void {
  app.post("/v1/mail/session", async (req, res) => {
    const ip = getClientIp(req);
    if (isSessionRateLimited(ip)) {
      res.status(429).json({ error: "Too many login attempts" });
      return;
    }
    try {
      const { email, password } = parseSessionBody(req.body);
      await verifyImapCredentials(email, password);
      const session = createMailSession(email, password);
      res.json({
        sessionToken: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        email: session.email,
      });
    } catch (error) {
      handleRouteError(res, error, "Mail login failed");
    }
  });

  app.delete("/v1/mail/session", (req, res) => {
    const token = parseBearerToken(req.headers.authorization);
    deleteMailSession(token ?? undefined);
    res.status(204).end();
  });

  app.get("/v1/mail/folders", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const { folders, delimiter } = await listMailFolders(session);
      res.json({ folders, delimiter });
    } catch (error) {
      handleRouteError(res, error, "Failed to list folders");
    }
  });

  app.post("/v1/mail/folders", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const path = parseFolderPathBody(req.body);
      await createMailFolder(session, path);
      res.status(201).json({ ok: true, path });
    } catch (error) {
      handleRouteError(res, error, "Failed to create folder");
    }
  });

  app.patch("/v1/mail/folders", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const { path, toPath } = parseFolderMoveBody(req.body);
      await renameMailFolder(session, path, toPath);
      res.json({ ok: true, path: toPath });
    } catch (error) {
      handleRouteError(res, error, "Failed to rename folder");
    }
  });

  app.post("/v1/mail/folders/move", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const { path, toPath } = parseFolderMoveBody(req.body);
      await renameMailFolder(session, path, toPath);
      res.json({ ok: true, path: toPath });
    } catch (error) {
      handleRouteError(res, error, "Failed to move folder");
    }
  });

  app.delete("/v1/mail/folders", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const folderPath =
        typeof req.query.path === "string"
          ? sanitizeFolderPath(req.query.path)
          : parseFolderPathBody(req.body);
      const delimiter =
        typeof req.query.delimiter === "string" && req.query.delimiter.length === 1
          ? req.query.delimiter
          : ".";
      const trashFolder = await resolveTrashFolder(session);
      await deleteMailFolder(session, folderPath, delimiter, trashFolder);
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to delete folder");
    }
  });

  app.post("/v1/mail/folders/clear", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const path = parseFolderPathBody(req.body);
      const trashFolder = await resolveTrashFolder(session);
      await clearMailFolder(session, path, trashFolder);
      res.json({ ok: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to clear folder");
    }
  });

  app.post("/v1/mail/folders/mark-all-read", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const path = parseFolderPathBody(req.body);
      await markAllMailFolderRead(session, path);
      res.json({ ok: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to mark folder as read");
    }
  });

  app.get("/v1/mail/messages", async (req, res) => {
    const session = requireMailSession(req, res);
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
      handleRouteError(res, error, "Failed to list messages");
    }
  });

  app.get("/v1/mail/messages/:uid", async (req, res) => {
    const session = requireMailSession(req, res);
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
      handleRouteError(res, error, "Failed to fetch message");
    }
  });

  app.patch("/v1/mail/messages/:uid", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const uid = parseMessageUid(req.params.uid ?? "");
      const { folder, addFlags, removeFlags } = parseMessageFlagsBody(req.body);
      await updateMailMessageFlags(session, folder, uid, {
        add: addFlags,
        remove: removeFlags,
      });
      res.json({ ok: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to update message flags");
    }
  });

  app.delete("/v1/mail/messages/:uid", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const folder = sanitizeFolderPath(typeof req.query.folder === "string" ? req.query.folder : "INBOX");
      const uid = parseMessageUid(req.params.uid ?? "");
      const trashFolder = await resolveTrashFolder(session);
      await deleteMailMessage(session, folder, uid, trashFolder);
      res.status(204).end();
    } catch (error) {
      handleRouteError(res, error, "Failed to delete message");
    }
  });

  app.post("/v1/mail/messages/:uid/move", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const uid = parseMessageUid(req.params.uid ?? "");
      const { fromFolder, toFolder } = parseMoveMailBody(req.body);
      await moveMailMessage(session, fromFolder, toFolder, uid);
      res.json({ ok: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to move message");
    }
  });

  app.post("/v1/mail/messages", async (req, res) => {
    const session = requireMailSession(req, res);
    if (!session) return;
    try {
      const record = parseSendMailBody(req.body);
      const payload = {
        to: typeof record.to === "string" ? record.to : "",
        cc: typeof record.cc === "string" ? record.cc : undefined,
        subject: typeof record.subject === "string" ? record.subject : "",
        bodyHtml:
          typeof record.bodyHtml === "string"
            ? record.bodyHtml
            : typeof record.body === "string"
              ? record.body
              : "",
        bodyText: typeof record.bodyText === "string" ? record.bodyText : undefined,
        inReplyTo: typeof record.inReplyTo === "string" ? record.inReplyTo : undefined,
        references: typeof record.references === "string" ? record.references : undefined,
      };
      await sendMailMessage(session, payload);
      res.status(201).json({ ok: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to send message");
    }
  });
}
