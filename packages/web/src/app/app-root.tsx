import React from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { isElectron } from "~/shared/lib/electron";
import App from "./app";

const Router = isElectron() ? HashRouter : BrowserRouter;

export const AppRoot: React.FC = () => {
  return (
    <React.StrictMode>
      <Router>
        <App />
      </Router>
    </React.StrictMode>
  );
};
