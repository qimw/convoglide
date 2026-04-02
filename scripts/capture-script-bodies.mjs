import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCdpClient, getFirstPageTarget, waitForDebuggerTargets } from "./cdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_URL =
  "https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/699b2b0c-5dc4-8333-a6dd-e88ac7753511";
const DEFAULT_KEYWORDS = ["document.title", "current_node", "mapping", "conversation"];

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    waitMs: 12000,
    maxScripts: 8,
    outputDir: resolve(repoRoot, "artifacts/script-scan"),
    keywords: [...DEFAULT_KEYWORDS],
    saveBodies: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
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
    if (arg === "--keywords") {
      args.keywords = String(argv[index + 1] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--save-bodies") {
      args.saveBodies = true;
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

function parseContentLength(headers = {}) {
  const direct = headers["content-length"] || headers["Content-Length"];
  const value = Number(direct);
  return Number.isFinite(value) ? value : null;
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
  if (message.method !== "Network.responseReceived") {
    return;
  }
  const params = message.params || {};
  if (params.type !== "Script") {
    return;
  }
  const url = params.response?.url || "";
  if (!url.startsWith("https://chatgpt.com/cdn/assets/")) {
    return;
  }
  scripts.set(params.requestId, {
    requestId: params.requestId,
    url,
    status: params.response?.status,
    mimeType: params.response?.mimeType || null,
    contentLength: parseContentLength(params.response?.headers || {}),
  });
});

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Network.enable");
    await send("Page.navigate", { url: args.url }, 10000);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, args.waitMs));

    const candidates = Array.from(scripts.values())
      .sort((left, right) => (right.contentLength || 0) - (left.contentLength || 0))
      .slice(0, args.maxScripts);

    const stamp = toStamp();
    const bodyDir = resolve(args.outputDir, `${stamp}-bodies`);
    if (args.saveBodies) {
      mkdirSync(bodyDir, { recursive: true });
    }

    const results = [];
    for (const candidate of candidates) {
      try {
        const bodyResult = await send("Network.getResponseBody", { requestId: candidate.requestId }, 10000);
        const source = bodyResult.base64Encoded
          ? Buffer.from(bodyResult.body, "base64").toString("utf8")
          : bodyResult.body;
        const matches = findKeywordMatches(source, args.keywords);
        const summary = {
          ...candidate,
          sourceLength: source.length,
          matches,
        };
        if (args.saveBodies) {
          const filePath = resolve(bodyDir, `${sanitizeName(candidate.url)}.js`);
          writeFileSync(filePath, source);
          summary.savedBodyPath = filePath;
        }
        results.push(summary);
      } catch (error) {
        results.push({
          ...candidate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const report = {
      ok: true,
      createdAt: new Date().toISOString(),
      url: args.url,
      waitMs: args.waitMs,
      maxScripts: args.maxScripts,
      keywords: args.keywords,
      capturedScriptCount: scripts.size,
      results,
    };
    const reportPath = resolve(args.outputDir, `${stamp}.body-scan.json`);
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
