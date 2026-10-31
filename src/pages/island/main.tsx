import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Pill } from "./Pill";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Pill />
  </React.StrictMode>,
);
