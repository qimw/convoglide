import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

function createReport(
  domNodes,
  heapMB,
  virtualizedTurns,
  heavyPlaceholders,
  scrollAverageFrameMs = 16.6,
  scrollDistancePx = -2700,
  scrollVerdict = "smooth",
  titleElapsedMs = 14003,
  mainResponseElapsedMs = 10746,
) {
  return {
    url: "https://chatgpt.com/example",
    keep: 80,
    firstLoad: {
      networkEvents: [
        {
          elapsedMs: mainResponseElapsedMs,
          url: "https://chatgpt.com/backend-api/conversation/699b2b0c-5dc4-8333-a6dd-e88ac7753511",
        },
      ],
    },
    summary: {
      firstResolvedTitleSample: {
        elapsedMs: titleElapsedMs,
      },
      stableSample: {
        label: "50000ms",
        phase: "lazy-heavy",
        domNodes,
        heapMB,
        virtualizedTurns,
        heavyPlaceholders,
      },
      scrollMetrics: {
        averageFrameMs: scrollAverageFrameMs,
        distance: scrollDistancePx,
      },
      scrollVerdict,
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
    assert.equal(payload.delta.titleElapsedMs, 0);
    assert.equal(payload.delta.mainResponseElapsedMs, 0);
    assert.equal(payload.delta.renderGapMs, 0);
    assert.equal(payload.delta.scrollAverageFrameMs, 0);
    assert.equal(payload.delta.scrollDistancePx, 0);
    assert.match(payload.markdown, /DOM nodes \| 3811 \| 3471 \| -340/);
    assert.match(payload.markdown, /Render gap ms \| 3257 \| 3257 \| 0/);
    assert.match(payload.markdown, /Scroll verdict \| smooth \| smooth \| n\/a/);
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

test("compare-benchmark-reports accepts raw probe report shapes", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "convoglide-compare-probe-"));
  try {
    const basePath = join(tempDir, "base-probe.json");
    const headPath = join(tempDir, "head-probe.json");

    writeFileSync(
      basePath,
      JSON.stringify({
        navigateUrl: "https://chatgpt.com/example",
        maxMessageNodes: 20,
        firstLoad: {
          networkEvents: [
            {
              elapsedMs: 13261,
              url: "https://chatgpt.com/backend-api/conversation/699b2b0c-5dc4-8333-a6dd-e88ac7753511",
            },
          ],
        },
        firstResolvedTitleSample: { elapsedMs: 15873 },
        stableSample: { domNodes: 1168, heapMB: 110, virtualizedTurns: 0, heavyPlaceholders: 0 },
        scrollVerdict: "unknown",
        scrollMetrics: { averageFrameMs: null, distance: null },
      }, null, 2),
    );
    writeFileSync(
      headPath,
      JSON.stringify({
        navigateUrl: "https://chatgpt.com/example",
        maxMessageNodes: 20,
        firstLoad: {
          networkEvents: [
            {
              elapsedMs: 10746,
              url: "https://chatgpt.com/backend-api/conversation/699b2b0c-5dc4-8333-a6dd-e88ac7753511",
            },
          ],
        },
        firstResolvedTitleSample: { elapsedMs: 14003 },
        stableSample: { domNodes: 3351, heapMB: 77, virtualizedTurns: 0, heavyPlaceholders: 13 },
        scrollVerdict: "smooth",
        scrollMetrics: { averageFrameMs: 16.6, distance: -2700 },
      }, null, 2),
    );

    const result = spawnSync(process.execPath, ["scripts/compare-benchmark-reports.mjs", basePath, headPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.base.renderGapMs, 2612);
    assert.equal(payload.head.renderGapMs, 3257);
    assert.equal(payload.delta.renderGapMs, 645);
    assert.equal(payload.head.scrollVerdict, "smooth");
    assert.match(payload.markdown, /First title ms \| 15873 \| 14003 \| -1870/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
