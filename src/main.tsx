import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initNativeChrome } from "./lib/native";
import "./styles.css";

initNativeChrome();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
