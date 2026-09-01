import * as React from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.js";
import { applyTheme, getInitialTheme } from "./lib/theme.js";
import "./index.css";
import App from "./App.js";

// Applied before the first paint (synchronously, before React mounts) so
// there's no light-mode flash for a user whose stored/system preference is dark.
applyTheme(getInitialTheme());

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
