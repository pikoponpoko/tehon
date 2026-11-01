// macOS: no Developer ID certificate, so the finished app is ad-hoc signed. Apple silicon refuses to open an
// unsigned or broken-signature app ("damaged"); the universal merge breaks Electron's own signatures.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async ctx => {
  if (ctx.electronPlatformName !== "darwin" || /-temp$/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" });
  console.log(`  • ad-hoc signed  ${app}`);
};
