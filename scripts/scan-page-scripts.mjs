import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCdpClient, getFirstPageTarget, waitForDebuggerTargets } from "./cdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_URL =
  "https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/699b2b0c-5dc4-8333-a6dd-e88ac7753511";
const DEFAULT_KEYWORDS = [
  "document.title",
  "current_node",
  "mapping",
  "conversation",
  "sidebar",
];
const SETUP_TIMEOUT_MS = 30000;

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    keywords: [...DEFAULT_KEYWORDS],
    waitMs: 12000,
    outputDir: resolve(repoRoot, "artifacts/script-scan"),
    saveSources: false,
    inventoryOnly: false,
    maxScripts: Number.POSITIVE_INFINITY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--url") {
      args.url = argv[index + 1] || args.url;
      index += 1;
      continue;
    }
    if (arg === "--keywords") {
      const raw = argv[index + 1] || "";
      args.keywords = raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--wait-ms") {
      args.waitMs = Math.max(2000, Number(argv[index + 1]) || args.waitMs);
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
    if (arg === "--inventory-only") {
      args.inventoryOnly = true;
    }
    if (arg === "--max-scripts") {
      const value = Number(argv[index + 1]);
      args.maxScripts = Number.isFinite(value) && value > 0 ? Math.floor(value) : Number.POSITIVE_INFINITY;
      index += 1;
    }
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
      const start = Math.max(0, offset - 120);
      const end = Math.min(source.length, offset + keyword.length + 120);
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

const args = parseArgs(process.argv.slice(2));
mkdirSync(args.outputDir, { recursive: true });

await waitForDebuggerTargets({ timeoutMs: 20000, intervalMs: 500 });
const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
const scripts = new Map();

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method !== "Debugger.scriptParsed") {
    return;
  }
  const params = message.params || {};
  if (!params.scriptId) {
    return;
  }
  scripts.set(params.scriptId, {
    scriptId: params.scriptId,
    url: params.url || "",
    hash: params.hash || null,
    startLine: params.startLine,
    endLine: params.endLine,
    length: params.length || null,
  });
});

ws.addEventListener("open", async () => {
  try {
    await send("Runtime.enable", {}, SETUP_TIMEOUT_MS);
    await send("Debugger.enable", {}, SETUP_TIMEOUT_MS);
    await send("Page.navigate", { url: args.url }, SETUP_TIMEOUT_MS);

    await new Promise((resolvePromise) => setTimeout(resolvePromise, args.waitMs));

    const candidateScripts = Array.from(scripts.values())
      .filter((script) => {
      const url = script.url || "";
      return url.startsWith("https://chatgpt.com/") || url.startsWith("https://cdn.oaistatic.com/");
      })
      .sort((left, right) => (right.length || 0) - (left.length || 0));
    const limitedScripts = candidateScripts.slice(0, args.maxScripts);

    const results = [];
    const stamp = toStamp();
    const sourceDir = resolve(args.outputDir, stamp);
    if (args.saveSources) {
      mkdirSync(sourceDir, { recursive: true });
    }

    if (args.inventoryOnly) {
      const report = {
        ok: true,
        createdAt: new Date().toISOString(),
        url: args.url,
        waitMs: args.waitMs,
        inventoryOnly: true,
        scannedScriptCount: candidateScripts.length,
        results: candidateScripts.map((script) => ({
          scriptId: script.scriptId,
          url: script.url,
          length: script.length,
          hash: script.hash,
        })),
      };
      const jsonPath = resolve(args.outputDir, `${stamp}.json`);
      writeFileSync(jsonPath, JSON.stringify(report, null, 2));
      finish({
        ...report,
        reportPath: jsonPath,
      });
      return;
    }

    for (const script of limitedScripts) {
      try {
        const sourceResult = await send("Debugger.getScriptSource", { scriptId: script.scriptId }, 10000);
        const source = sourceResult.scriptSource || "";
        const matches = findKeywordMatches(source, args.keywords);
        if (!matches.length) {
          continue;
        }
        const summary = {
          ...script,
          sourceLength: source.length,
          matches,
        };
        if (args.saveSources) {
          const baseName = sanitizeName(script.url || script.scriptId);
          const filePath = resolve(sourceDir, `${baseName}.js`);
          writeFileSync(filePath, source);
          summary.savedSourcePath = filePath;
        }
        results.push(summary);
      } catch (error) {
        results.push({
          ...script,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const report = {
      ok: true,
      createdAt: new Date().toISOString(),
      url: args.url,
      waitMs: args.waitMs,
      keywords: args.keywords,
      scannedScriptCount: candidateScripts.length,
      fetchedScriptCount: limitedScripts.length,
      matchedScriptCount: results.filter((entry) => Array.isArray(entry.matches) && entry.matches.length).length,
      results,
    };

    const jsonPath = resolve(args.outputDir, `${stamp}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    finish({
      ...report,
      reportPath: jsonPath,
    });
  } catch (error) {
    finish({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
