/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Adds a Content-Security-Policy to the production build only (dev server needs inline scripts for HMR). */
function contentSecurityPolicy(apiBase: string | undefined): Plugin {
  let apiOrigin = "";
  try {
    apiOrigin = apiBase && /^https?:/.test(apiBase) ? new URL(apiBase).origin : "";
  } catch {
    apiOrigin = "";
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "frame-src 'self' about:",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

// GitHub Pages serves the app under /<repo>/. Override with VITE_BASE for other hosts.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/Pharma-Advanced/",
  plugins: [react(), contentSecurityPolicy(process.env.VITE_API_BASE_URL)],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
