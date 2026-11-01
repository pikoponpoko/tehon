// Copies the browser build (../dist) into web/, and the app icon into build/ for electron-builder.
const fs = require("node:fs");
const path = require("node:path");
const dist = path.join(__dirname, "..", "dist");
if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Run `npm run build` in the repository root first.");
fs.rmSync(path.join(__dirname, "web"), { recursive: true, force: true });
fs.cpSync(dist, path.join(__dirname, "web"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "build"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "..", "public", "icons", "icon-512.png"), path.join(__dirname, "build", "icon.png"));
