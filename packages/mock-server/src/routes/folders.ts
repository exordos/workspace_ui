import type { Express, Request, Response } from "express";

export interface MockFolder {
  id: string;
  label: string;
  badge?: number;
}

const folders: MockFolder[] = [
  { id: "1", label: "Folder 1", badge: 4 },
  { id: "2", label: "Folder 2" },
  { id: "3", label: "Folder 3", badge: 4 },
];

export function registerFoldersRoutes(app: Express, apiBase: string) {
  app.get(`${apiBase}/folders`, (_req: Request, res: Response) => {
    res.json({ folders });
  });
}
