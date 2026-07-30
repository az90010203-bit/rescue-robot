import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./renderer/App";
import "./renderer/styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Electron renderer root is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
