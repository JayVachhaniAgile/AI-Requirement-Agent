import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5173,
  },
  base: process.env.BASE_PATH || "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
