/**
 * MSW request handlers for testing.
 *
 * Import and extend in individual test files:
 * ```ts
 * import { handlers } from "~/test/mocks/handlers";
 * const server = setupServer(...handlers);
 * ```
 */
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("*/api/v1/users/me", () => {
    return HttpResponse.json({
      result: "success",
      user_id: 1,
      full_name: "Test User",
      email: "test@example.com",
    });
  }),

  http.get("*/api/v1/users", () => {
    return HttpResponse.json({
      result: "success",
      members: [
        {
          user_id: 1,
          full_name: "Test User",
          email: "test@example.com",
          avatar_url: null,
          is_bot: false,
          is_active: true,
        },
        {
          user_id: 2,
          full_name: "Other User",
          email: "other@example.com",
          avatar_url: null,
          is_bot: false,
          is_active: true,
        },
      ],
    });
  }),

  http.get("*/api/v1/messages", () => {
    return HttpResponse.json({
      result: "success",
      messages: [],
      found_oldest: true,
      found_newest: true,
    });
  }),

  http.post("*/api/v1/messages", () => {
    return HttpResponse.json({
      result: "success",
      id: 1001,
    });
  }),

  http.post("*/api/v1/messages/flags", () => {
    return HttpResponse.json({
      result: "success",
      messages: [],
    });
  }),
];
