import React from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { isElectron } from "~/shared/lib/electron";
import { ToastHost } from "~/shared/ui/toast-host.ui";
import App from "./app";

const Router = isElectron() ? HashRouter : BrowserRouter;

export const AppRoot: React.FC = () => {
  return (
    <React.StrictMode>
      <Router>
        <App />
        <ToastHost />
      </Router>
    </React.StrictMode>
  );
};
