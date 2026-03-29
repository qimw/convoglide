import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const distDir = resolve(repoRoot, "dist");
const extensionDir = resolve(repoRoot, "extension");
const userscriptPath = resolve(repoRoot, "userscript/convoglide.user.js");
const userscriptDistPath = resolve(distDir, "convoglide.user.js");
const extensionZipPath = resolve(distDir, "convoglide-extension.zip");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [resolve(repoRoot, "scripts/build-runtime.mjs")]);

mkdirSync(distDir, { recursive: true });
rmSync(extensionZipPath, { force: true });

copyFileSync(userscriptPath, userscriptDistPath);

run("zip", ["-qr", extensionZipPath, "."], {
  cwd: extensionDir,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      userscript: userscriptDistPath,
      extensionZip: extensionZipPath,
    },
    null,
    2,
  ),
);
