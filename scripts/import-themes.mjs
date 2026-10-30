// プリプロ名人の docs/color-themes.json から src/themes.json を作る
// node scripts/import-themes.mjs ../prepro-meijin/docs/color-themes.json
import { readFileSync, writeFileSync } from "node:fs";
const KEYS = ["--bg", "--panel", "--line", "--text", "--muted", "--accent", "--danger", "--lane"];
const set = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = set.themes.map(t => ({ id: t.id, name: t.name, p: t.palette, l: KEYS.map(k => t.light.app[k]), d: KEYS.map(k => t.dark.app[k]) }));
writeFileSync(new URL("../src/themes.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(out.length);
