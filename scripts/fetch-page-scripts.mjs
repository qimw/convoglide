import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCdpClient, getFirstPageTarget, waitForDebuggerTargets } from "./cdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_KEYWORDS = ["document.title", "current_node", "mapping", "conversation"];
const SETUP_TIMEOUT_MS = 30000;

function parseArgs(argv) {
  const args = {
    inventoryPath: "",
    url: "",
    waitMs: 12000,
    maxScripts: 8,
    evalTimeoutMs: 60000,
    keywords: [...DEFAULT_KEYWORDS],
    outputDir: resolve(repoRoot, "artifacts/script-scan"),
    saveSources: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (!args.inventoryPath && !arg.startsWith("--")) {
      args.inventoryPath = resolve(repoRoot, arg);
      continue;
    }
    if (arg === "--url") {
      args.url = argv[index + 1] || args.url;
      index += 1;
      continue;
    }
    if (arg === "--wait-ms") {
      args.waitMs = Math.max(2000, Number(argv[index + 1]) || args.waitMs);
      index += 1;
      continue;
    }
    if (arg === "--max-scripts") {
      const value = Number(argv[index + 1]);
      args.maxScripts = Number.isFinite(value) && value > 0 ? Math.floor(value) : args.maxScripts;
      index += 1;
      continue;
    }
    if (arg === "--eval-timeout-ms") {
      const value = Number(argv[index + 1]);
      args.evalTimeoutMs = Number.isFinite(value) && value >= 10000 ? Math.floor(value) : args.evalTimeoutMs;
      index += 1;
      continue;
    }
    if (arg === "--keywords") {
      args.keywords = String(argv[index + 1] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      args.outputDir = resolve(repoRoot, argv[index + 1] || "artifacts/script-scan");
      index += 1;
      continue;
    }
    if (arg === "--save-sources") {
      args.saveSources = true;
    }
  }

  if (!args.inventoryPath) {
    console.error(
      "Usage: node scripts/fetch-page-scripts.mjs <inventory-json> --url <page-url> [--max-scripts 8] [--keywords document.title,current_node]",
    );
    process.exit(1);
  }

  return args;
}

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sanitizeName(value) {
  return String(value || "script")
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 140);
}

function findKeywordMatches(source, keywords) {
  const matches = [];
  for (const keyword of keywords) {
    if (!keyword) continue;
    let offset = source.indexOf(keyword);
    while (offset !== -1) {
      const start = Math.max(0, offset - 140);
      const end = Math.min(source.length, offset + keyword.length + 140);
      matches.push({
        keyword,
        offset,
        snippet: source.slice(start, end).replace(/\s+/g, " ").trim(),
      });
      offset = source.indexOf(keyword, offset + keyword.length);
      if (matches.length >= 20) {
        return matches;
      }
    }
  }
  return matches;
}

function buildFetchExpression(url) {
  return `(() => fetch(${JSON.stringify(url)}, { credentials: "include" })
    .then(async (response) => ({
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    })))()`;
}

const args = parseArgs(process.argv.slice(2));
const inventory = JSON.parse(readFileSync(args.inventoryPath, "utf8"));
const candidates = (Array.isArray(inventory.results) ? inventory.results : [])
  .filter((entry) => typeof entry.url === "string" && entry.url.startsWith("https://chatgpt.com/cdn/assets/"))
  .sort((left, right) => (right.length || 0) - (left.length || 0))
  .slice(0, args.maxScripts);

mkdirSync(args.outputDir, { recursive: true });
await waitForDebuggerTargets({ timeoutMs: 20000, intervalMs: 500 });
const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

ws.addEventListener("open", async () => {
  try {
    await send("Runtime.enable", {}, SETUP_TIMEOUT_MS);
    if (args.url) {
      await send("Page.navigate", { url: args.url }, SETUP_TIMEOUT_MS);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, args.waitMs));
    }

    const stamp = toStamp();
    const sourceDir = resolve(args.outputDir, `${stamp}-page-fetch`);
    if (args.saveSources) {
      mkdirSync(sourceDir, { recursive: true });
    }

    const results = [];
    for (const candidate of candidates) {
      try {
        const runtime = await send(
          "Runtime.evaluate",
          {
            expression: buildFetchExpression(candidate.url),
            awaitPromise: true,
            returnByValue: true,
          },
          args.evalTimeoutMs,
        );
        const value = runtime.result.value || {};
        const source = String(value.text || "");
        const matches = findKeywordMatches(source, args.keywords);
        const summary = {
          scriptId: candidate.scriptId,
          url: candidate.url,
          inventoryLength: candidate.length,
          status: value.status,
          responseOk: value.ok,
          sourceLength: source.length,
          matches,
        };
        if (args.saveSources) {
          const filePath = resolve(sourceDir, `${sanitizeName(candidate.url)}.js`);
          writeFileSync(filePath, source);
          summary.savedSourcePath = filePath;
        }
        results.push(summary);
      } catch (error) {
        results.push({
          scriptId: candidate.scriptId,
          url: candidate.url,
          inventoryLength: candidate.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const report = {
      ok: true,
      createdAt: new Date().toISOString(),
      inventoryPath: args.inventoryPath,
      url: args.url,
      waitMs: args.waitMs,
      maxScripts: args.maxScripts,
      evalTimeoutMs: args.evalTimeoutMs,
      keywords: args.keywords,
      matchedScriptCount: results.filter((entry) => Array.isArray(entry.matches) && entry.matches.length).length,
      results,
    };

    const reportPath = resolve(args.outputDir, `${stamp}.page-fetch.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    finish({
      ...report,
      reportPath,
    });
  } catch (error) {
    finish({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
