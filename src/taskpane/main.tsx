import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import "../i18n";
import "../styles/global.css";
import { registerRibbonActions } from "../commands/ribbon";

if (typeof Office !== "undefined") {
  Office.onReady(() => registerRibbonActions());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
