import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const distDir = resolve(repoRoot, "dist");
const userscriptPath = resolve(distDir, "convoglide.user.js");
const extensionZipPath = resolve(distDir, "convoglide-extension.zip");

if (!existsSync(userscriptPath)) {
  throw new Error("Missing packaged userscript: dist/convoglide.user.js");
}

if (!existsSync(extensionZipPath)) {
  throw new Error("Missing packaged extension zip: dist/convoglide-extension.zip");
}

const userscript = readFileSync(userscriptPath, "utf8");
for (const requiredToken of ["ConvoGlide", "window.ConvoGlide", "convoglide:max-message-nodes"]) {
  if (!userscript.includes(requiredToken)) {
    throw new Error(`Packaged userscript is missing token: ${requiredToken}`);
  }
}

for (const forbiddenToken of ["MilkGPT", "milkgpt", "window.MilkGPT"]) {
  if (userscript.includes(forbiddenToken)) {
    throw new Error(`Packaged userscript still contains forbidden token: ${forbiddenToken}`);
  }
}

const zipList = spawnSync("unzip", ["-Z1", extensionZipPath], {
  cwd: repoRoot,
  encoding: "utf8",
});

if (zipList.status !== 0) {
  throw new Error(zipList.stderr || zipList.stdout || "Failed to inspect extension zip");
}

for (const requiredEntry of ["manifest.json", "content.css", "content.js", "page-hook.js"]) {
  if (!zipList.stdout.split("\n").includes(requiredEntry)) {
    throw new Error(`Packaged extension zip is missing entry: ${requiredEntry}`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      userscriptPath: "dist/convoglide.user.js",
      extensionZipPath: "dist/convoglide-extension.zip",
    },
    null,
    2,
  ),
);
