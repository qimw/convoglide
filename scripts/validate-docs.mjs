import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const requiredFiles = [
  "README.md",
  "README.zh-CN.md",
  "docs/install.md",
  "docs/benchmarks.md",
  "docs/benchmark-workflow.md",
  "docs/architecture.md",
  "docs/roadmap.md",
  "docs/faq.md",
  "docs/releasing.md",
  "docs/store-readiness.md",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    throw new Error(`Missing required documentation file: ${relativePath}`);
  }
}

const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
const readmeZh = readFileSync(resolve(repoRoot, "README.zh-CN.md"), "utf8");
const benchmarks = readFileSync(resolve(repoRoot, "docs/benchmarks.md"), "utf8");

for (const section of [
  "## Quick Install",
  "## Performance Snapshot",
  "## TODO / Roadmap",
  "## Docs",
  "## Experiment Note",
]) {
  if (!readme.includes(section)) {
    throw new Error(`README.md is missing section: ${section}`);
  }
}

for (const section of [
  "## 快速开始",
  "## 效果摘要",
  "## TODO / 路线图",
  "## 文档",
  "## 实验说明",
]) {
  if (!readmeZh.includes(section)) {
    throw new Error(`README.zh-CN.md is missing section: ${section}`);
  }
}

for (const forbiddenTerm of ["Gemini", "Claude"]) {
  if (readme.includes(forbiddenTerm)) {
    throw new Error(`README.md still mentions out-of-scope target: ${forbiddenTerm}`);
  }
  if (readmeZh.includes(forbiddenTerm)) {
    throw new Error(`README.zh-CN.md still mentions out-of-scope target: ${forbiddenTerm}`);
  }
}

for (const iteration of ["| 0 |", "| 1A |", "| 1B |", "| 2 |", "| 3 |"]) {
  if (!readme.includes(iteration)) {
    throw new Error(`README.md is missing benchmark row marker: ${iteration}`);
  }
}

for (const benchmarkMarker of ["| 0 |", "| 1A |", "| 1B |", "| 2 |", "| 3 |"]) {
  if (!benchmarks.includes(benchmarkMarker)) {
    throw new Error(`docs/benchmarks.md is missing benchmark row marker: ${benchmarkMarker}`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedFiles: requiredFiles.length,
      benchmarkRows: 5,
    },
    null,
    2,
  ),
);
