import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { getTargets } from "./cdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    url: "",
    keep: 20,
    outDir: resolve(repoRoot, "artifacts/benchmarks"),
    launch: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (!args.url && !arg.startsWith("--")) {
      args.url = arg;
      continue;
    }
    if (arg === "--keep") {
      args.keep = Math.max(20, Number(argv[index + 1]) || 20);
      index += 1;
      continue;
    }
    if (arg === "--out-dir") {
      args.outDir = resolve(repoRoot, argv[index + 1] || "artifacts/benchmarks");
      index += 1;
      continue;
    }
    if (arg === "--no-launch") {
      args.launch = false;
    }
  }

  if (!args.url) {
    console.error("Usage: node scripts/run-benchmark-lane.mjs <chat-url> [--keep 20] [--out-dir artifacts/benchmarks] [--no-launch]");
    process.exit(1);
  }

  return args;
}

async function waitForDebugger(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await getTargets();
      if (Array.isArray(targets) && targets.length) {
        return true;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function runJsonScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to run ${scriptPath}`);
  }

  return JSON.parse(result.stdout);
}

async function runJsonScriptWithRetry(scriptPath, args = [], attempts = 5) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runJsonScript(scriptPath, args);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error(`Failed to run ${scriptPath}`);
}

function isUsableFirstLoadResult(firstLoad) {
  if (!firstLoad?.ok) {
    return false;
  }
  const samples = Array.isArray(firstLoad.samples) ? firstLoad.samples : [];
  return samples.some((sample) => sample?.ok);
}

async function runFirstLoadProbeWithRetry(args, attempts = 3) {
  let lastResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await runJsonScriptWithRetry(
      resolve(repoRoot, "scripts/probe-userscript-first-load.mjs"),
      args,
      2,
    );
    lastResult = result;
    if (isUsableFirstLoadResult(result)) {
      return result;
    }
    if (attempt < attempts) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    }
  }

  throw new Error(lastResult?.error || "Benchmark lane did not capture any usable first-load samples.");
}

function summarize(firstLoad, injection, url, keep) {
  const samples = Array.isArray(firstLoad.samples) ? firstLoad.samples : [];
  const okSamples = samples.filter((sample) => sample.ok);
  const stableSample = okSamples.at(-1) || null;
  const firstResolvedTitleSample = okSamples.find((sample) => sample.title && sample.title !== "ChatGPT") || null;
  const firstVirtualizerSample =
    okSamples.find((sample) => (sample.virtualizedTurns || 0) > 0 || sample.phase === "virtualizer") || null;
  const maxVirtualizedTurns = okSamples.reduce((best, sample) => Math.max(best, sample.virtualizedTurns || 0), 0);
  const maxHeavyPlaceholders = okSamples.reduce((best, sample) => Math.max(best, sample.heavyPlaceholders || 0), 0);

  return {
    createdAt: new Date().toISOString(),
    url,
    keep,
    injection,
    firstLoad,
    summary: {
      stableSample,
      firstResolvedTitleSample,
      firstVirtualizerSample,
      maxVirtualizedTurns,
      maxHeavyPlaceholders,
      networkEventCount: Array.isArray(firstLoad.networkEvents) ? firstLoad.networkEvents.length : 0,
    },
  };
}

function renderMarkdown(report) {
  const stable = report.summary.stableSample;
  const firstVirtualizer = report.summary.firstVirtualizerSample;

  return [
    "# ConvoGlide Benchmark Lane",
    "",
    `- Created at: \`${report.createdAt}\``,
    `- URL: \`${report.url}\``,
    `- Keep limit: \`${report.keep}\``,
    `- Injection OK: \`${Boolean(report.injection?.ok)}\``,
    `- API visible: \`${Boolean(report.injection?.apiVisible)}\``,
    "",
    "## Summary",
    "",
    `- First virtualizer sample: ${firstVirtualizer ? `\`${firstVirtualizer.label}\`` : "`n/a`"}`,
    `- Max virtualized turns: \`${report.summary.maxVirtualizedTurns}\``,
    `- Max heavy placeholders: \`${report.summary.maxHeavyPlaceholders}\``,
    `- Stable DOM: \`${stable?.domNodes ?? "n/a"}\``,
    `- Stable heap: \`${stable?.heapMB ?? "n/a"} MB\``,
    `- Stable phase: \`${stable?.phase ?? "n/a"}\``,
    "",
      "## Samples",
      "",
      "| Sample | Phase | DOM | Virtualized turns | Heavy placeholders | Heap | Title |",
      "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...((report.firstLoad.samples || []).map((sample) => {
      const title = String(sample.title || "").replace(/\|/g, "\\|");
      return `| ${sample.label} | ${sample.phase || "n/a"} | ${sample.domNodes ?? "n/a"} | ${sample.virtualizedTurns ?? "n/a"} | ${sample.heavyPlaceholders ?? "n/a"} | ${sample.heapMB ?? "n/a"} | ${title || "n/a"} |`;
    })),
    "",
  ].join("\n");
}

function toStamp(isoString) {
  return isoString.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const args = parseArgs(process.argv.slice(2));

let launchProcess = null;
if (args.launch) {
  launchProcess = spawn("./scripts/launch-test-chrome.sh", ["about:blank"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
  });
  launchProcess.unref();
}

const debuggerReady = await waitForDebugger();
if (!debuggerReady) {
  console.error("Chrome remote debugging did not become ready in time.");
  process.exit(1);
}

const injection = await runJsonScriptWithRetry(resolve(repoRoot, "scripts/probe-userscript-injection.mjs"), [
  "https://chatgpt.com/",
]);
const firstLoad = await runFirstLoadProbeWithRetry([
  args.url,
  String(args.keep),
]);
const report = summarize(firstLoad, injection, args.url, args.keep);
if (!report.summary.stableSample) {
  throw new Error("Benchmark lane did not produce a stable sample.");
}
const markdown = renderMarkdown(report);

mkdirSync(args.outDir, { recursive: true });
const historyDir = resolve(args.outDir, "history");
mkdirSync(historyDir, { recursive: true });
const jsonPath = resolve(args.outDir, "latest.json");
const markdownPath = resolve(args.outDir, "latest.md");
const stamp = toStamp(report.createdAt);
const historyJsonPath = resolve(historyDir, `${stamp}.json`);
const historyMarkdownPath = resolve(historyDir, `${stamp}.md`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
writeFileSync(markdownPath, `${markdown}\n`);
copyFileSync(jsonPath, historyJsonPath);
copyFileSync(markdownPath, historyMarkdownPath);

console.log(
  JSON.stringify(
    {
      ok: true,
      jsonPath,
      markdownPath,
      historyJsonPath,
      historyMarkdownPath,
      summary: report.summary,
    },
    null,
    2,
  ),
);
