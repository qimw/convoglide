import { createCdpClient, getFirstPageTarget, waitForDebuggerTargets } from "./cdp.js";
import { buildInjectedUserScript } from "./userscript-source.js";

function parseArgs(argv) {
  const args = {
    navigateUrl:
      argv[0] ||
      "https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/699b2b0c-5dc4-8333-a6dd-e88ac7753511",
    maxMessageNodes: argv[1] ? Number(argv[1]) : Number.NaN,
    bootstrapTurnWindow: Number.NaN,
    plain: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--bootstrap-turn-window") {
      args.bootstrapTurnWindow = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--plain") {
      args.plain = true;
    }
  }

  return args;
}

function makeSnapshotExpression() {
  return `(() => ({
    title: document.title,
    readyState: document.readyState,
    href: location.href,
    hasBadge: !!document.getElementById('convoglide-badge'),
    badgeText: document.getElementById('convoglide-badge')?.innerText || null,
    phase: document.documentElement.dataset.convoglidePhase || null,
    summary: document.documentElement.dataset.convoglideSummary || null,
    eventCount: Array.isArray(window.__CONVOGLIDE_EVENTS) ? window.__CONVOGLIDE_EVENTS.length : 0,
    domNodes: document.getElementsByTagName('*').length,
    virtualizedTurns: document.querySelectorAll('[data-convoglide-virtualized="true"]').length,
    heavyPlaceholders: document.querySelectorAll('[data-convoglide-heavy-placeholder="true"]').length,
    heapMB: performance.memory?.usedJSHeapSize ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null
  }))()`;
}

function makeFinalStateExpression() {
  return `(() => {
    const conversationCache = localStorage.getItem('convoglide:conversation-cache');
    const auxiliaryCache = localStorage.getItem('convoglide:auxiliary-cache');
    return {
      phase: document.documentElement.dataset.convoglidePhase || null,
      summary: document.documentElement.dataset.convoglideSummary || null,
      events: Array.isArray(window.__CONVOGLIDE_EVENTS) ? window.__CONVOGLIDE_EVENTS : [],
      cache: {
        conversationBytes: conversationCache ? conversationCache.length : 0,
        auxiliaryBytes: auxiliaryCache ? auxiliaryCache.length : 0,
        conversationEntryCount: conversationCache ? Object.keys(JSON.parse(conversationCache)).length : 0,
        auxiliaryEntryCount: auxiliaryCache ? Object.keys(JSON.parse(auxiliaryCache)).length : 0,
      }
    };
  })()`;
}

function makeScrollExpression() {
  return `(() => new Promise((resolve) => {
    function findScrollRoot() {
      const candidates = [document.scrollingElement, document.documentElement, document.body].filter(Boolean);
      for (const element of document.querySelectorAll('*')) {
        const style = getComputedStyle(element);
        const overflowY = style.overflowY || '';
        if (!/(auto|scroll|overlay)/.test(overflowY)) {
          continue;
        }
        if (element.scrollHeight <= element.clientHeight + 32) {
          continue;
        }
        candidates.push(element);
      }

      let best = candidates[0] || document.documentElement;
      let bestDistance = Math.max(0, best.scrollHeight - best.clientHeight);
      for (const candidate of candidates) {
        const distance = Math.max(0, candidate.scrollHeight - candidate.clientHeight);
        if (distance > bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      return best;
    }

    const root = findScrollRoot();
    const startTop = root.scrollTop;
    const viewportHeight = root === document.scrollingElement || root === document.documentElement || root === document.body
      ? window.innerHeight
      : root.clientHeight;
    const maxTop = Math.max(0, root.scrollHeight - viewportHeight);
    const preferredDistance = Math.max(viewportHeight * 4, 2400);
    const availableDown = Math.max(0, maxTop - startTop);
    const availableUp = Math.max(0, startTop);
    const direction = availableDown >= availableUp ? 1 : -1;
    const availableDistance = direction > 0 ? availableDown : availableUp;
    const travelDistance = Math.min(availableDistance, preferredDistance);
    const targetTop = Math.max(0, Math.min(maxTop, startTop + direction * travelDistance));
    if (Math.abs(targetTop - startTop) < 200) {
      resolve({
        ok: true,
        distance: 0,
        averageFrameMs: 0,
        worstFrameMs: 0,
        framesOver33: 0,
        framesOver50: 0,
        totalFrames: 0,
        rootTag: root?.tagName || null,
        rootClass: String(root?.className || '').slice(0, 120),
        direction: 'none',
        startTop: Math.round(startTop),
        maxTop: Math.round(maxTop),
      });
      return;
    }

    const frames = [];
    let previous = performance.now();
    let rafCount = 0;

    function finish() {
      root.scrollTop = startTop;
      const usable = frames.slice(1);
      const averageFrameMs = usable.length
        ? Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10
        : 0;
      const worstFrameMs = usable.length ? Math.round(Math.max(...usable) * 10) / 10 : 0;
      const framesOver33 = usable.filter((value) => value > 33).length;
      const framesOver50 = usable.filter((value) => value > 50).length;
      resolve({
        ok: true,
        distance: Math.round(targetTop - startTop),
        averageFrameMs,
        worstFrameMs,
        framesOver33,
        framesOver50,
        totalFrames: usable.length,
        rootTag: root?.tagName || null,
        rootClass: String(root?.className || '').slice(0, 120),
        direction: direction > 0 ? 'down' : 'up',
        startTop: Math.round(startTop),
        maxTop: Math.round(maxTop),
      });
    }

    function tick(now) {
      frames.push(now - previous);
      previous = now;
      rafCount += 1;
      const progress = Math.min(1, rafCount / 120);
      const nextTop = startTop + (targetTop - startTop) * progress;
      root.scrollTop = nextTop;
      if (progress >= 1) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }))()`;
}

function classifySmoothness(scrollMetrics) {
  if (!scrollMetrics?.ok) {
    return "unknown";
  }
  if (scrollMetrics.totalFrames === 0) {
    return "not-scrollable";
  }
  if (scrollMetrics.framesOver50 <= 1 && scrollMetrics.averageFrameMs <= 20) {
    return "smooth";
  }
  if (scrollMetrics.framesOver50 <= 4 && scrollMetrics.averageFrameMs <= 28) {
    return "mostly-smooth";
  }
  return "janky";
}

const args = parseArgs(process.argv.slice(2));
const navigateUrl = args.navigateUrl;
const maxMessageNodes = args.maxMessageNodes;
const sampleTimesMs = [1000, 2000, 4000, 8000, 12000, 18000, 25000, 35000, 50000];

await waitForDebuggerTargets({ timeoutMs: 20000, intervalMs: 500 });
const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
const source = buildInjectedUserScript(maxMessageNodes, {
  bootstrapTurnWindow: args.bootstrapTurnWindow,
});
const samples = [];
const networkEvents = [];
const startedAt = Date.now();

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

async function sample(label) {
  const elapsedMs = Date.now() - startedAt;
  try {
    const runtime = await send(
      "Runtime.evaluate",
      {
        expression: makeSnapshotExpression(),
        returnByValue: true,
      },
      3000,
    );
    samples.push({ label, elapsedMs, ok: true, ...runtime.result.value });
  } catch (error) {
    samples.push({ label, elapsedMs, ok: false, error: error.message });
  }
}

async function measureScroll() {
  try {
    const runtime = await send(
      "Runtime.evaluate",
      {
        expression: makeScrollExpression(),
        awaitPromise: true,
        returnByValue: true,
      },
      30000,
    );
    return runtime.result.value;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function captureFinalState() {
  try {
    const runtime = await send(
      "Runtime.evaluate",
      {
        expression: makeFinalStateExpression(),
        returnByValue: true,
      },
      5000,
    );
    return runtime.result.value;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Network.responseReceived") {
    const url = msg.params.response?.url || "";
    if (
      url.includes("/backend-api/conversation/") ||
      url.includes("/backend-api/conversations") ||
      url.includes("/backend-api/gizmos/")
    ) {
      networkEvents.push({
        elapsedMs: Date.now() - startedAt,
        status: msg.params.response.status,
        url,
      });
    }
  }
});

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    if (!args.plain) {
      await send("Page.addScriptToEvaluateOnNewDocument", { source }, 10000);
    }
    await send("Page.navigate", { url: navigateUrl }, 10000);

    for (const ms of sampleTimesMs) {
      setTimeout(() => {
        sample(`${ms}ms`).catch(() => {});
      }, ms);
    }

    setTimeout(() => {
      const okSamples = samples.filter((sample) => sample.ok);
      const firstResolvedTitleSample = okSamples.find((sample) => sample.title && sample.title !== "ChatGPT") || null;
      const stableSample = okSamples.at(-1) || null;
      Promise.all([measureScroll(), captureFinalState()]).then(([scrollMetrics, finalState]) => {
        finish({
          ok: true,
          mode: args.plain ? "plain" : "optimized",
          navigateUrl,
          maxMessageNodes: Number.isFinite(maxMessageNodes) ? maxMessageNodes : null,
          bootstrapTurnWindow: Number.isFinite(args.bootstrapTurnWindow) ? args.bootstrapTurnWindow : null,
          samples,
          networkEvents,
          firstResolvedTitleSample,
          stableSample,
          scrollMetrics,
          scrollVerdict: classifySmoothness(scrollMetrics),
          finalState,
        });
      });
    }, Math.max(...sampleTimesMs) + 4000);
  } catch (error) {
    finish({
      ok: false,
      mode: args.plain ? "plain" : "optimized",
      error: error.message,
      samples,
      networkEvents,
    });
  }
});
