import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// "demo" mode builds a single self-contained HTML with demo data (no Dropbox), used for the shareable preview.
export default defineConfig(({ mode }) => ({
  plugins: mode === "demo" ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === "demo" ? "dist-demo" : "dist" },
}));
