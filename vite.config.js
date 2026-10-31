import { defineConfig } from "vite";
import { cpSync } from "node:fs";

// pdf.js loads its character maps, standard fonts and image decoders at run time: they are copied to /pdfjs/ (in dev they come from node_modules).
const pdfjsFiles = {
  name: "pdfjs-files",
  apply: "build",
  closeBundle() {
    for (const d of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(`node_modules/pdfjs-dist/${d}`, `dist/pdfjs/${d}`, { recursive: true });
  },
};

// Port 5173 is fixed because http://localhost:5173/ is registered as a Dropbox Redirect URI.
export default defineConfig({
  plugins: [pdfjsFiles],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
