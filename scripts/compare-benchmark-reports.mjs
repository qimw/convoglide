import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pickMainConversationEventFromEvents } from "./benchmark-utils.mjs";

function readReport(pathLike) {
  return JSON.parse(readFileSync(resolve(pathLike), "utf8"));
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function pickMainConversationEvent(report) {
  const events = Array.isArray(report?.firstLoad?.networkEvents)
    ? report.firstLoad.networkEvents
    : Array.isArray(report?.networkEvents)
      ? report.networkEvents
      : [];
  return pickMainConversationEventFromEvents(events);
}

function formatSignedDelta(value, suffix = "") {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${suffix}`;
}

function formatCountFraction(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return "n/a";
  }
  return `${value}/${total}`;
}

function formatVerdictCounts(counts, total) {
  if (!counts || typeof counts !== "object") {
    return "unknown";
  }
  const entries = Object.entries(counts);
  if (!entries.length) {
    return "unknown";
  }
  return entries
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([verdict, count]) => `${verdict} ${count}/${total}`)
    .join(", ");
}

function summarizeReport(report) {
  if (report?.summary?.optimized && report?.summary?.plain) {
    const optimized = report.summary.optimized;
    return {
      domNodes: null,
      heapMB: null,
      virtualizedTurns: null,
      heavyPlaceholders: null,
      titleElapsedMs: numberOrNull(optimized?.medianTitleMs),
      mainResponseElapsedMs: numberOrNull(optimized?.medianResponseMs),
      renderGapMs: numberOrNull(optimized?.medianRenderGapMs),
      scrollAverageFrameMs: numberOrNull(optimized?.medianScrollAverageFrameMs),
      scrollDistancePx: null,
      scrollVerdict: formatVerdictCounts(optimized?.scrollVerdictCounts, optimized?.runCount),
      passiveSoakCount: numberOrNull(optimized?.stableThrough50sCount),
      runCount: numberOrNull(optimized?.runCount),
      phase: "user-facing",
      label: `optimized n=${optimized?.runCount ?? "n/a"}`,
      url: report?.url || "n/a",
      keep: report?.keep ?? "n/a",
    };
  }

  const stable = report?.summary?.stableSample || report?.stableSample || {};
  const firstResolvedTitleSample = report?.summary?.firstResolvedTitleSample || report?.firstResolvedTitleSample || null;
  const mainConversationEvent = pickMainConversationEvent(report);
  const titleElapsedMs = numberOrNull(firstResolvedTitleSample?.elapsedMs);
  const mainResponseElapsedMs = numberOrNull(mainConversationEvent?.elapsedMs);
  const renderGapMs = numberOrNull((titleElapsedMs ?? NaN) - (mainResponseElapsedMs ?? NaN));
  const scrollMetrics = report?.summary?.scrollMetrics || report?.scrollMetrics || null;
  const scrollVerdict = report?.summary?.scrollVerdict || report?.scrollVerdict || "unknown";
  return {
    domNodes: numberOrNull(stable.domNodes),
    heapMB: numberOrNull(stable.heapMB),
    virtualizedTurns: numberOrNull(stable.virtualizedTurns),
    heavyPlaceholders: numberOrNull(stable.heavyPlaceholders),
    titleElapsedMs,
    mainResponseElapsedMs,
    renderGapMs,
    scrollAverageFrameMs: numberOrNull(scrollMetrics?.averageFrameMs),
    scrollDistancePx: numberOrNull(scrollMetrics?.distance),
    scrollVerdict,
    passiveSoakCount: null,
    runCount: null,
    phase: stable.phase || "n/a",
    label: stable.label || "n/a",
    url: report?.url || report?.navigateUrl || "n/a",
    keep: report?.keep ?? report?.maxMessageNodes ?? "n/a",
  };
}

const basePath = process.argv[2];
const headPath = process.argv[3];

if (!basePath || !headPath) {
  console.error("Usage: node scripts/compare-benchmark-reports.mjs <base-report.json> <head-report.json>");
  process.exit(1);
}

const base = summarizeReport(readReport(basePath));
const head = summarizeReport(readReport(headPath));
const delta = {
  domNodes: numberOrNull((head.domNodes ?? NaN) - (base.domNodes ?? NaN)),
  heapMB: numberOrNull((head.heapMB ?? NaN) - (base.heapMB ?? NaN)),
  virtualizedTurns: numberOrNull((head.virtualizedTurns ?? NaN) - (base.virtualizedTurns ?? NaN)),
  heavyPlaceholders: numberOrNull((head.heavyPlaceholders ?? NaN) - (base.heavyPlaceholders ?? NaN)),
  titleElapsedMs: numberOrNull((head.titleElapsedMs ?? NaN) - (base.titleElapsedMs ?? NaN)),
  mainResponseElapsedMs: numberOrNull((head.mainResponseElapsedMs ?? NaN) - (base.mainResponseElapsedMs ?? NaN)),
  renderGapMs: numberOrNull((head.renderGapMs ?? NaN) - (base.renderGapMs ?? NaN)),
  scrollAverageFrameMs: numberOrNull((head.scrollAverageFrameMs ?? NaN) - (base.scrollAverageFrameMs ?? NaN)),
  scrollDistancePx: numberOrNull((head.scrollDistancePx ?? NaN) - (base.scrollDistancePx ?? NaN)),
  passiveSoakCount: numberOrNull((head.passiveSoakCount ?? NaN) - (base.passiveSoakCount ?? NaN)),
};

const comparison = {
  ok: true,
  basePath: resolve(basePath),
  headPath: resolve(headPath),
  base,
  head,
  delta,
  markdown: "",
};

comparison.markdown = [
  "# ConvoGlide Benchmark Comparison",
  "",
  `- Base: \`${comparison.basePath}\``,
  `- Head: \`${comparison.headPath}\``,
  "",
  "| Metric | Base | Head | Delta |",
  "| --- | ---: | ---: | ---: |",
  `| First title ms | ${base.titleElapsedMs ?? "n/a"} | ${head.titleElapsedMs ?? "n/a"} | ${formatSignedDelta(comparison.delta.titleElapsedMs)} |`,
  `| Main response ms | ${base.mainResponseElapsedMs ?? "n/a"} | ${head.mainResponseElapsedMs ?? "n/a"} | ${formatSignedDelta(comparison.delta.mainResponseElapsedMs)} |`,
  `| Render gap ms | ${base.renderGapMs ?? "n/a"} | ${head.renderGapMs ?? "n/a"} | ${formatSignedDelta(comparison.delta.renderGapMs)} |`,
  `| Passive soak success | ${formatCountFraction(base.passiveSoakCount, base.runCount)} | ${formatCountFraction(head.passiveSoakCount, head.runCount)} | ${formatSignedDelta(comparison.delta.passiveSoakCount)} |`,
  `| DOM nodes | ${base.domNodes ?? "n/a"} | ${head.domNodes ?? "n/a"} | ${formatSignedDelta(comparison.delta.domNodes)} |`,
  `| Heap MB | ${base.heapMB ?? "n/a"} | ${head.heapMB ?? "n/a"} | ${formatSignedDelta(comparison.delta.heapMB)} |`,
  `| Virtualized turns | ${base.virtualizedTurns ?? "n/a"} | ${head.virtualizedTurns ?? "n/a"} | ${formatSignedDelta(comparison.delta.virtualizedTurns)} |`,
  `| Heavy placeholders | ${base.heavyPlaceholders ?? "n/a"} | ${head.heavyPlaceholders ?? "n/a"} | ${formatSignedDelta(comparison.delta.heavyPlaceholders)} |`,
  `| Scroll average frame ms | ${base.scrollAverageFrameMs ?? "n/a"} | ${head.scrollAverageFrameMs ?? "n/a"} | ${formatSignedDelta(comparison.delta.scrollAverageFrameMs)} |`,
  `| Scroll distance px | ${base.scrollDistancePx ?? "n/a"} | ${head.scrollDistancePx ?? "n/a"} | ${formatSignedDelta(comparison.delta.scrollDistancePx)} |`,
  `| Scroll verdict | ${base.scrollVerdict} | ${head.scrollVerdict} | n/a |`,
  "",
].join("\n");

console.log(JSON.stringify(comparison, null, 2));
