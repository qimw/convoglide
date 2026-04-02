import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_KEYWORDS = [
  "document.title",
  "current_node",
  "mapping",
  "conversation",
];

function parseArgs(argv) {
  const args = {
    inventoryPath: "",
    keywords: [...DEFAULT_KEYWORDS],
    maxScripts: 12,
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
    if (arg === "--keywords") {
      args.keywords = String(argv[index + 1] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--max-scripts") {
      const value = Number(argv[index + 1]);
      args.maxScripts = Number.isFinite(value) && value > 0 ? Math.floor(value) : args.maxScripts;
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
      "Usage: node scripts/scan-script-urls.mjs <inventory-json> [--keywords document.title,current_node] [--max-scripts 12] [--save-sources]",
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

const args = parseArgs(process.argv.slice(2));
const inventory = JSON.parse(readFileSync(args.inventoryPath, "utf8"));
const candidates = (Array.isArray(inventory.results) ? inventory.results : [])
  .filter((entry) => typeof entry.url === "string" && entry.url.startsWith("https://chatgpt.com/"))
  .sort((left, right) => (right.length || 0) - (left.length || 0))
  .slice(0, args.maxScripts);

mkdirSync(args.outputDir, { recursive: true });
const stamp = toStamp();
const sourceDir = resolve(args.outputDir, stamp);
if (args.saveSources) {
  mkdirSync(sourceDir, { recursive: true });
}

const results = [];

for (const candidate of candidates) {
  try {
    const response = await fetch(candidate.url);
    const source = await response.text();
    const matches = findKeywordMatches(source, args.keywords);
    const summary = {
      scriptId: candidate.scriptId,
      url: candidate.url,
      inventoryLength: candidate.length,
      responseOk: response.ok,
      status: response.status,
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
  keywords: args.keywords,
  maxScripts: args.maxScripts,
  matchedScriptCount: results.filter((entry) => Array.isArray(entry.matches) && entry.matches.length).length,
  results,
};

const reportPath = resolve(args.outputDir, `${stamp}.url-scan.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ...report,
      reportPath,
    },
    null,
    2,
  ),
);
