import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readReport(pathLike) {
  return JSON.parse(readFileSync(resolve(pathLike), "utf8"));
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function formatSignedDelta(value, suffix = "") {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${suffix}`;
}

function summarizeReport(report) {
  const stable = report?.summary?.stableSample || {};
  return {
    domNodes: numberOrNull(stable.domNodes),
    heapMB: numberOrNull(stable.heapMB),
    virtualizedTurns: numberOrNull(stable.virtualizedTurns),
    heavyPlaceholders: numberOrNull(stable.heavyPlaceholders),
    scrollAverageFrameMs: numberOrNull(report?.summary?.scrollMetrics?.averageFrameMs),
    scrollDistancePx: numberOrNull(report?.summary?.scrollMetrics?.distance),
    scrollVerdict: report?.summary?.scrollVerdict || "unknown",
    phase: stable.phase || "n/a",
    label: stable.label || "n/a",
    url: report?.url || "n/a",
    keep: report?.keep ?? "n/a",
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
  scrollAverageFrameMs: numberOrNull((head.scrollAverageFrameMs ?? NaN) - (base.scrollAverageFrameMs ?? NaN)),
  scrollDistancePx: numberOrNull((head.scrollDistancePx ?? NaN) - (base.scrollDistancePx ?? NaN)),
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
