import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-ignore Development-only request adapter; excluded from the desktop bundle.
import { musicApiPlugin } from "./scripts/web-api.mjs";
export default defineConfig({
  plugins: [react(), musicApiPlugin()],
  server: {
    host: "127.0.0.1",
    port: 1431,
    strictPort: true,
    watch: {
      ignored: ["**/.local/**", "**/src-tauri/target/**", "**/deliverables/**"],
    },
  },
  clearScreen: false,
});
