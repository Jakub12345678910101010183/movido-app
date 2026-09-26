import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Last-resort logging for promise rejections nothing handled. Features show
// their own error states; this only makes stray failures visible in logs.
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Movido] Unhandled promise rejection:", event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
