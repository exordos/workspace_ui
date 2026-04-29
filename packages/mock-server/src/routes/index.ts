import { registerFoldersRoutes } from "./folders";
import { registerMessagesRoutes, getTopicsByStream  } from "./messages";
import { registerStreamsRoutes } from "./streams";
import { registerUsersRoutes } from "./users";
import type { Express } from "express";

export function registerApiRoutes(app: Express) {
  const apiBase = "/api/v1";

  registerUsersRoutes(app, apiBase);
  registerStreamsRoutes(app, apiBase, getTopicsByStream);
  registerMessagesRoutes(app, apiBase);
  registerFoldersRoutes(app, apiBase);
}

