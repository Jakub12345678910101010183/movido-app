import { initializeTomTomConfig } from './lib/tomtom-config';
initializeTomTomConfig();

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
