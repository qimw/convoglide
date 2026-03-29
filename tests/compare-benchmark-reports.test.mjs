import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

function createReport(domNodes, heapMB, virtualizedTurns, heavyPlaceholders) {
  return {
    url: "https://chatgpt.com/example",
    keep: 80,
    summary: {
      stableSample: {
        label: "50000ms",
        phase: "lazy-heavy",
        domNodes,
        heapMB,
        virtualizedTurns,
        heavyPlaceholders,
      },
    },
  };
}

test("compare-benchmark-reports computes stable deltas", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "convoglide-compare-"));
  try {
    const basePath = join(tempDir, "base.json");
    const headPath = join(tempDir, "head.json");

    writeFileSync(basePath, JSON.stringify(createReport(3811, 101, 33, 0), null, 2));
    writeFileSync(headPath, JSON.stringify(createReport(3471, 98, 33, 13), null, 2));

    const result = spawnSync(process.execPath, ["scripts/compare-benchmark-reports.mjs", basePath, headPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.delta.domNodes, -340);
    assert.equal(payload.delta.heapMB, -3);
    assert.equal(payload.delta.virtualizedTurns, 0);
    assert.equal(payload.delta.heavyPlaceholders, 13);
    assert.match(payload.markdown, /DOM nodes \| 3811 \| 3471 \| -340/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("compare-benchmark-reports requires two paths", () => {
  const result = spawnSync(process.execPath, ["scripts/compare-benchmark-reports.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /Usage:/);
});
