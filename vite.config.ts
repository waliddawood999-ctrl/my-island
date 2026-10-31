import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// منفذ dev: 1420 كما في tauri.conf.json. المداخل: الصفحات الموجودة فعليًا فقط الآن (index = main).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: { index: resolve(__dirname, "index.html") },
    },
  },
});
