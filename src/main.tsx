// Runtime compatibility required by pdfjs-dist 5.x. These imports
// are side-effect only and must run before any lazy PDF.js chunk.
import "@/lib/polyfills/collection-upsert";
import "@/lib/polyfills/uint8-hex";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";

// Styles: tokens first (CSS custom properties), then global resets, then
// chrome/primitive styles. Order matters - later sheets read tokens defined
// in the first. Feature-specific styles such as KaTeX are loaded with the
// feature so they do not delay the landing screen.
import "@/styles/tokens.css";
import "@/styles/global.css";
import "@/styles/chrome.css";
import "@/styles/terminal.css";
import "@/styles/editorial.css";
import "@/styles/landing.css";

const root = document.getElementById("root");
if (!root) throw new Error("OpenDraft: #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
