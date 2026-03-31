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

function createUserFacingReport(titleMs, responseMs, renderGapMs, stableCount, scrollVerdictCounts, scrollAverageFrameMs = 17.1) {
  return {
    url: "https://chatgpt.com/example",
    keep: 8,
    summary: {
      plain: {
        mode: "plain",
        runCount: 2,
        medianTitleMs: titleMs + 500,
        medianResponseMs: responseMs + 300,
        medianRenderGapMs: renderGapMs + 200,
        stableThrough50sCount: 0,
        scrollVerdictCounts: { unknown: 2 },
        medianScrollAverageFrameMs: null,
      },
      optimized: {
        mode: "optimized",
        runCount: 2,
        medianTitleMs: titleMs,
        medianResponseMs: responseMs,
        medianRenderGapMs: renderGapMs,
        stableThrough50sCount: stableCount,
        scrollVerdictCounts,
        medianScrollAverageFrameMs: scrollAverageFrameMs,
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
              elapsedMs: 2400,
              url: "https://chatgpt.com/backend-api/conversation/init",
            },
            {
              elapsedMs: 13261,
              url: "https://chatgpt.com/backend-api/conversation/699b2b0c-5dc4-8333-a6dd-e88ac7753511",
            },
            {
              elapsedMs: 15001,
              url: "https://chatgpt.com/backend-api/conversation/699b2b0c-5dc4-8333-a6dd-e88ac7753511/stream_status",
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
              elapsedMs: 1800,
              url: "https://chatgpt.com/backend-api/conversation/init",
            },
            {
              elapsedMs: 10746,
              url: "https://chatgpt.com/backend-api/conversation/699b2b0c-5dc4-8333-a6dd-e88ac7753511",
            },
            {
              elapsedMs: 11111,
              url: "https://chatgpt.com/backend-api/conversation/699b2b0c-5dc4-8333-a6dd-e88ac7753511/textdocs",
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

test("compare-benchmark-reports accepts user-facing lane summaries", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "convoglide-compare-user-facing-"));
  try {
    const basePath = join(tempDir, "base-user-facing.json");
    const headPath = join(tempDir, "head-user-facing.json");

    writeFileSync(
      basePath,
      JSON.stringify(createUserFacingReport(17626.5, 14177, 3449.5, 2, { smooth: 2 }, 16.5), null, 2),
    );
    writeFileSync(
      headPath,
      JSON.stringify(createUserFacingReport(14352, 12541.5, 1810.5, 2, { smooth: 2 }, 17.1), null, 2),
    );

    const result = spawnSync(process.execPath, ["scripts/compare-benchmark-reports.mjs", basePath, headPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.base.titleElapsedMs, 17626.5);
    assert.equal(payload.head.titleElapsedMs, 14352);
    assert.equal(payload.delta.titleElapsedMs, -3274.5);
    assert.equal(payload.base.passiveSoakCount, 2);
    assert.equal(payload.head.passiveSoakCount, 2);
    assert.equal(payload.head.scrollVerdict, "smooth 2/2");
    assert.match(payload.markdown, /Passive soak success \| 2\/2 \| 2\/2 \| 0/);
    assert.match(payload.markdown, /First title ms \| 17626.5 \| 14352 \| -3274.5/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
