import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        overlay: resolve(root, "overlay.html"),
        settings: resolve(root, "settings.html"),
        editor: resolve(root, "editor.html"),
      },
    },
  },
});
