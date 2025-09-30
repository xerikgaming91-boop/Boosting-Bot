import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// WICHTIG: Root auf src/frontend setzen, sonst findet Vite die index.html nicht.
const root = path.resolve(__dirname, ".");

export default defineConfig({
  root,                  // -> src/frontend
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    open: false,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()]
    }
  },
  // optional: wohin der Build rausfällt (für später)
  build: {
    outDir: path.resolve(process.cwd(), "dist/frontend"),
    emptyOutDir: true
  }
});
