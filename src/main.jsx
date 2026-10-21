import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

function ReadyApp() {
  useLayoutEffect(() => {
    document.getElementById("app-loading")?.remove();
  }, []);

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ReadyApp />
  </React.StrictMode>
);
