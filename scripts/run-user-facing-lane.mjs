import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { waitForDebuggerTargets } from "./cdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const CONVERSATION_RESPONSE_RE = /\/backend-api\/conversation\/[0-9a-f-]+(?:\?|$)/i;
const DEFAULT_KEEP = 8;
const MIN_KEEP = 4;

function parseArgs(argv) {
  const args = {
    url: "",
    iterations: 2,
    keep: DEFAULT_KEEP,
    outDir: resolve(repoRoot, "artifacts/user-facing"),
    launch: true,
    optimizedCacheMode: "preserve",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (!args.url && !arg.startsWith("--")) {
      args.url = arg;
      continue;
    }
    if (arg === "--iterations") {
      args.iterations = Math.max(1, Number(argv[index + 1]) || 2);
      index += 1;
      continue;
    }
    if (arg === "--keep") {
      args.keep = Math.max(MIN_KEEP, Number(argv[index + 1]) || DEFAULT_KEEP);
      index += 1;
      continue;
    }
    if (arg === "--out-dir") {
      args.outDir = resolve(repoRoot, argv[index + 1] || "artifacts/user-facing");
      index += 1;
      continue;
    }
    if (arg === "--no-launch") {
      args.launch = false;
      continue;
    }
    if (arg === "--optimized-cache-mode") {
      const value = String(argv[index + 1] || "preserve");
      args.optimizedCacheMode = ["preserve", "cold"].includes(value) ? value : "preserve";
      index += 1;
    }
  }

  if (!args.url) {
    console.error(
      `Usage: node scripts/run-user-facing-lane.mjs <chat-url> [--iterations 2] [--keep ${DEFAULT_KEEP}] [--out-dir artifacts/user-facing] [--no-launch]`,
    );
    process.exit(1);
  }

  return args;
}

function launchCleanChrome() {
  const child = spawn("./scripts/launch-test-chrome.sh", ["about:blank"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CONVOGLIDE_DISABLE_EXTENSIONS: "1",
    },
  });
  child.unref();
}

async function prepareBrowser() {
  launchCleanChrome();
  await waitForDebuggerTargets({ timeoutMs: 20000, intervalMs: 500 });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
}

async function clearConversationCache() {
  return runJsonScriptWithRetry(resolve(repoRoot, "scripts/manage-convoglide-cache.mjs"), ["clear", "--conversation"], 3);
}

function runJsonScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to run ${scriptPath}`);
  }

  const stdout = result.stdout?.trim();
  if (!stdout) {
    throw new Error(`No JSON output from ${scriptPath}`);
  }

  return JSON.parse(stdout);
}

async function runJsonScriptWithRetry(scriptPath, args = [], attempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runJsonScript(scriptPath, args);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1200));
    }
  }

  throw lastError || new Error(`Failed to run ${scriptPath}`);
}

function isUsableProbeResult(report) {
  if (!report?.ok) {
    return false;
  }
  const samples = Array.isArray(report?.samples) ? report.samples : [];
  return samples.some((sample) => sample?.ok);
}

async function runProbe(url, keep, plain) {
  const args = [url, String(keep)];
  if (plain) {
    args.push("--plain");
  }

  let lastReport = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const report = await runJsonScriptWithRetry(
      resolve(repoRoot, "scripts/probe-userscript-first-load.mjs"),
      args,
      2,
    );
    lastReport = report;
    if (isUsableProbeResult(report)) {
      return report;
    }
    if (attempt < 3) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    }
  }

  throw new Error(lastReport?.error || `Probe did not collect usable samples (${plain ? "plain" : "optimized"}).`);
}

async function runMode(url, keep, plain, shouldLaunch, options = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (shouldLaunch) {
        await prepareBrowser();
      }
      if (!plain && options.optimizedCacheMode === "cold") {
        await clearConversationCache();
      }
      return await runProbe(url, keep, plain);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
      }
    }
  }

  throw lastError || new Error(`Failed to run ${plain ? "plain" : "optimized"} mode.`);
}

function pickMainConversationEvent(report) {
  const events = Array.isArray(report?.networkEvents) ? report.networkEvents : [];
  return (
    events.find((event) => {
      const url = String(event?.url || "");
      return CONVERSATION_RESPONSE_RE.test(url);
    }) || null
  );
}

function summarizeReport(report, mode) {
  const stableSample = report?.stableSample || null;
  const firstResolvedTitleSample = report?.firstResolvedTitleSample || null;
  const mainConversationEvent = pickMainConversationEvent(report);
  const titleMs = Number.isFinite(firstResolvedTitleSample?.elapsedMs) ? firstResolvedTitleSample.elapsedMs : null;
  const responseMs = Number.isFinite(mainConversationEvent?.elapsedMs) ? mainConversationEvent.elapsedMs : null;
  const renderGapMs =
    Number.isFinite(titleMs) && Number.isFinite(responseMs) ? Math.round(titleMs - responseMs) : null;
  const scrollAverageFrameMs = Number.isFinite(report?.scrollMetrics?.averageFrameMs)
    ? report.scrollMetrics.averageFrameMs
    : null;
  const stableThrough50s =
    stableSample?.label === "50000ms" || (Number.isFinite(stableSample?.elapsedMs) && stableSample.elapsedMs >= 50000);

  return {
    mode,
    titleMs,
    responseMs,
    renderGapMs,
    stableThrough50s,
    scrollVerdict: report?.scrollVerdict || "unknown",
    scrollAverageFrameMs,
  };
}

function median(values) {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!filtered.length) {
    return null;
  }
  const middle = Math.floor(filtered.length / 2);
  if (filtered.length % 2 === 1) {
    return filtered[middle];
  }
  return Math.round(((filtered[middle - 1] + filtered[middle]) / 2) * 10) / 10;
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = value || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function summarizeRuns(runs, mode) {
  return {
    mode,
    runCount: runs.length,
    medianTitleMs: median(runs.map((run) => run.titleMs)),
    medianResponseMs: median(runs.map((run) => run.responseMs)),
    medianRenderGapMs: median(runs.map((run) => run.renderGapMs)),
    stableThrough50sCount: runs.filter((run) => run.stableThrough50s).length,
    scrollVerdictCounts: countBy(runs.map((run) => run.scrollVerdict)),
    medianScrollAverageFrameMs: median(runs.map((run) => run.scrollAverageFrameMs)),
  };
}

function renderMarkdown(report) {
  const plain = report.summary.plain;
  const optimized = report.summary.optimized;
  return [
    "# ConvoGlide User-facing Lane",
    "",
    `- Created at: \`${report.createdAt}\``,
    `- URL: \`${report.url}\``,
    `- Iterations: \`${report.iterations}\``,
    `- Keep limit: \`${report.keep}\``,
    `- Optimized cache mode: \`${report.optimizedCacheMode}\``,
    "",
    "| Metric | Plain | Optimized |",
    "| --- | ---: | ---: |",
    `| Median first title ms | ${plain.medianTitleMs ?? "n/a"} | ${optimized.medianTitleMs ?? "n/a"} |`,
    `| Median main response ms | ${plain.medianResponseMs ?? "n/a"} | ${optimized.medianResponseMs ?? "n/a"} |`,
    `| Median render gap ms | ${plain.medianRenderGapMs ?? "n/a"} | ${optimized.medianRenderGapMs ?? "n/a"} |`,
    `| Stable through 50s | ${plain.stableThrough50sCount}/${plain.runCount} | ${optimized.stableThrough50sCount}/${optimized.runCount} |`,
    `| Scroll verdicts | ${JSON.stringify(plain.scrollVerdictCounts)} | ${JSON.stringify(optimized.scrollVerdictCounts)} |`,
    `| Median scroll avg frame ms | ${plain.medianScrollAverageFrameMs ?? "n/a"} | ${optimized.medianScrollAverageFrameMs ?? "n/a"} |`,
    "",
  ].join("\n");
}

function toStamp(isoString) {
  return isoString.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const args = parseArgs(process.argv.slice(2));
const rawDir = resolve(args.outDir, "raw");
mkdirSync(rawDir, { recursive: true });

const plainRuns = [];
const optimizedRuns = [];
const rawReports = [];

for (let index = 1; index <= args.iterations; index += 1) {
  const plainReport = await runMode(args.url, args.keep, true, args.launch);
  plainRuns.push(summarizeReport(plainReport, "plain"));
  rawReports.push({ filename: `plain-${index}.json`, report: plainReport });

  const optimizedReport = await runMode(args.url, args.keep, false, args.launch, {
    optimizedCacheMode: args.optimizedCacheMode,
  });
  optimizedRuns.push(summarizeReport(optimizedReport, "optimized"));
  rawReports.push({ filename: `optimized-${index}.json`, report: optimizedReport });
}

const report = {
  createdAt: new Date().toISOString(),
  url: args.url,
  iterations: args.iterations,
  keep: args.keep,
  optimizedCacheMode: args.optimizedCacheMode,
  summary: {
    plain: summarizeRuns(plainRuns, "plain"),
    optimized: summarizeRuns(optimizedRuns, "optimized"),
  },
  runs: {
    plain: plainRuns,
    optimized: optimizedRuns,
  },
};

const markdown = renderMarkdown(report);
const stamp = toStamp(report.createdAt);
const latestJsonPath = resolve(args.outDir, "latest.json");
const latestMarkdownPath = resolve(args.outDir, "latest.md");
const historyDir = resolve(args.outDir, "history");
mkdirSync(historyDir, { recursive: true });
const historyJsonPath = resolve(historyDir, `${stamp}.json`);
const historyMarkdownPath = resolve(historyDir, `${stamp}.md`);

for (const entry of rawReports) {
  writeFileSync(resolve(rawDir, `${stamp}-${entry.filename}`), JSON.stringify(entry.report, null, 2));
}

writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
writeFileSync(latestMarkdownPath, `${markdown}\n`);
copyFileSync(latestJsonPath, historyJsonPath);
copyFileSync(latestMarkdownPath, historyMarkdownPath);

console.log(
  JSON.stringify(
    {
      ok: true,
      latestJsonPath,
      latestMarkdownPath,
      historyJsonPath,
      historyMarkdownPath,
      summary: report.summary,
    },
    null,
    2,
  ),
);
