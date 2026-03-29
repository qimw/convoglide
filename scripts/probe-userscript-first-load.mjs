import { createCdpClient, getFirstPageTarget } from "./cdp.js";
import { buildInjectedUserScript } from "./userscript-source.js";

const navigateUrl =
  process.argv[2] ||
  "https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/699b2b0c-5dc4-8333-a6dd-e88ac7753511";
const maxMessageNodes = process.argv[3] ? Number(process.argv[3]) : Number.NaN;
const sampleTimesMs = [1000, 2000, 4000, 8000, 12000, 18000, 25000, 35000, 50000];

const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
const source = buildInjectedUserScript(maxMessageNodes);
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
        expression: `(() => ({
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
        }))()`,
        returnByValue: true,
      },
      3000,
    );
    samples.push({ label, elapsedMs, ok: true, ...runtime.result.value });
  } catch (error) {
    samples.push({ label, elapsedMs, ok: false, error: error.message });
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
    await send("Page.addScriptToEvaluateOnNewDocument", { source }, 10000);
    await send("Page.navigate", { url: navigateUrl }, 10000);

    for (const ms of sampleTimesMs) {
      setTimeout(() => {
        sample(`${ms}ms`).catch(() => {});
      }, ms);
    }

    setTimeout(() => {
      finish({
        ok: true,
        navigateUrl,
        maxMessageNodes: Number.isFinite(maxMessageNodes) ? maxMessageNodes : null,
        samples,
        networkEvents,
      });
    }, Math.max(...sampleTimesMs) + 4000);
  } catch (error) {
    finish({ ok: false, error: error.message, samples, networkEvents });
  }
});
