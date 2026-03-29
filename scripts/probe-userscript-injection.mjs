import { createCdpClient, getFirstPageTarget } from "./cdp.js";
import { buildInjectedUserScript } from "./userscript-source.js";

const navigateUrl = process.argv[2] || "https://chatgpt.com/";
const maxMessageNodes = process.argv[3] ? Number(process.argv[3]) : Number.NaN;
const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
const source = buildInjectedUserScript(maxMessageNodes);

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source }, 10000);
    await send("Page.navigate", { url: navigateUrl }, 10000);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const runtime = await send("Runtime.evaluate", {
      expression: `(() => ({
        title: document.title,
        path: location.pathname,
        hasBadge: !!document.getElementById('convoglide-badge'),
        badgeText: document.getElementById('convoglide-badge')?.innerText || null,
        phase: document.documentElement.dataset.convoglidePhase || null,
        summary: document.documentElement.dataset.convoglideSummary || null,
        eventCount: Array.isArray(window.__CONVOGLIDE_EVENTS) ? window.__CONVOGLIDE_EVENTS.length : 0,
        apiVisible: !!window.ConvoGlide
      }))()`,
      returnByValue: true,
    });
    finish({ ok: true, navigateUrl, maxMessageNodes: Number.isFinite(maxMessageNodes) ? maxMessageNodes : null, ...runtime.result.value });
  } catch (error) {
    finish({ ok: false, error: error.message });
  }
});
