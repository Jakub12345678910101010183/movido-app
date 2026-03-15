import { initializeTomTomConfig } from './lib/tomtom-config';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Initialize TomTom configuration
initializeTomTomConfig();

// Global error handler for Navigator lock timeout errors
if (typeof window !== 'undefined') {
  // Suppress unhandled promise rejections for Navigator lock timeouts
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    const errorMsg = error?.message || String(error);
    const isNavigatorLockError =
      errorMsg.includes('Navigator') ||
      errorMsg.includes('LockManager') ||
      errorMsg.includes('timeout');

    if (isNavigatorLockError) {
      console.warn('[Global] Suppressing Navigator lock timeout error');
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
