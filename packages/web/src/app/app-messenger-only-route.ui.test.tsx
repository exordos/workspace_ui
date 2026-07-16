import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MessengerOnlyRoute } from "./app-messenger-only-route.ui";

const CurrentPath = () => <div data-testid="path">{useLocation().pathname}</div>;

function renderRoute(initialPath: string, routePath: string, messengerOnly: boolean): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CurrentPath />
      <Routes>
        <Route
          path={routePath}
          element={
            <MessengerOnlyRoute messengerOnly={messengerOnly}>
              <div>restricted page</div>
            </MessengerOnlyRoute>
          }
        />
        <Route path="/inbox" element={<div>inbox</div>} />
        <Route path="/org/:orgId/inbox" element={<div>scoped inbox</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MessengerOnlyRoute", () => {
  it("renders the product page when messenger-only mode is disabled", () => {
    renderRoute("/calendar", "/calendar", false);
    expect(screen.getByText("restricted page")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/calendar");
  });

  it("redirects unscoped product routes to inbox", () => {
    renderRoute("/mail", "/mail", true);
    expect(screen.getByText("inbox")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/inbox");
  });

  it("preserves the organization scope when redirecting", () => {
    renderRoute("/org/acme/calls", "/org/:orgId/calls", true);
    expect(screen.getByText("scoped inbox")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/org/acme/inbox");
  });
});
