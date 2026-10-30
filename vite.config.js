import { defineConfig } from "vite";

// Port 5173 is fixed because http://localhost:5173/ is registered as a Dropbox Redirect URI.
export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
