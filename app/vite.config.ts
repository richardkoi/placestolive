import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Use relative paths so the build works under any subdirectory.
  // DreamHost serves us at /placestolive/, local FastAPI dev at /, both work.
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8500", changeOrigin: true },
    },
  },
});
