import type { Express, Request, Response } from "express";

interface MockUser {
  user_id: number;
  email: string;
  full_name: string;
  is_bot: boolean;
  is_active: boolean;
}

const users: MockUser[] = [
  {
    user_id: 1,
    email: "iago@example.com",
    full_name: "Ilya Fomin",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 2,
    email: "cordelia@example.com",
    full_name: "Daria Isakova",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 3,
    email: "bot@example.com",
    full_name: "Reminder Bot",
    is_bot: true,
    is_active: true,
  },
  {
    user_id: 4,
    email: "designer@example.com",
    full_name: "Anna Designer",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 5,
    email: "pm@example.com",
    full_name: "Michael Product",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 6,
    email: "qa@example.com",
    full_name: "Kate QA",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 7,
    email: "devops@example.com",
    full_name: "Sergey DevOps",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 8,
    email: "analyst@example.com",
    full_name: "Alex Analyst",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 9,
    email: "support@example.com",
    full_name: "Marina Support",
    is_bot: false,
    is_active: true,
  },
  {
    user_id: 10,
    email: "marketing@example.com",
    full_name: "Oleg Marketing",
    is_bot: false,
    is_active: true,
  },
];

export function registerUsersRoutes(app: Express, apiBase: string) {
  app.get(`${apiBase}/users`, (_req: Request, res: Response) => {
    res.json({
      result: "success",
      msg: "",
      members: users,
    });
  });
}

