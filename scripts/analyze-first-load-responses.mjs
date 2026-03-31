import { createCdpClient, getFirstPageTarget } from "./cdp.js";

function parseArgs(argv) {
  const args = {
    navigateUrl:
      argv[0] ||
      "https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/699b2b0c-5dc4-8333-a6dd-e88ac7753511",
    timeoutMs: 25_000,
    minBytes: 24_000,
    top: 12,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--timeout") {
      args.timeoutMs = Math.max(5_000, Number(argv[index + 1]) || args.timeoutMs);
      index += 1;
      continue;
    }
    if (arg === "--min-bytes") {
      args.minBytes = Math.max(1_000, Number(argv[index + 1]) || args.minBytes);
      index += 1;
      continue;
    }
    if (arg === "--top") {
      args.top = Math.max(1, Number(argv[index + 1]) || args.top);
      index += 1;
    }
  }

  return args;
}

function summarizeBody(text, contentType) {
  const summary = {
    bytes: Buffer.byteLength(text, "utf8"),
    preview: text.replace(/\s+/g, " ").slice(0, 180),
    shape: null,
  };

  if (!contentType.includes("json")) {
    summary.shape = "non-json";
    return summary;
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      summary.shape = `array(${parsed.length})`;
      if (parsed[0] && typeof parsed[0] === "object" && !Array.isArray(parsed[0])) {
        summary.topLevelKeys = Object.keys(parsed[0]).slice(0, 8);
      }
      return summary;
    }
    if (parsed && typeof parsed === "object") {
      summary.shape = "object";
      summary.topLevelKeys = Object.keys(parsed).slice(0, 12);
      for (const key of ["items", "data", "results", "connectors", "sources", "tasks"]) {
        if (Array.isArray(parsed[key])) {
          summary.arrayField = key;
          summary.arrayLength = parsed[key].length;
          break;
        }
      }
      return summary;
    }
    summary.shape = typeof parsed;
    return summary;
  } catch {
    summary.shape = "invalid-json";
    return summary;
  }
}

const args = parseArgs(process.argv.slice(2));
const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
const requestMap = new Map();
const results = [];

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

ws.addEventListener("message", async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.method === "Network.responseReceived") {
    const { requestId, response, type } = msg.params;
    const url = String(response?.url || "");
    const contentType = String(response?.mimeType || response?.headers?.["content-type"] || "");
    if (!url.startsWith("https://chatgpt.com/")) {
      return;
    }
    if (type && !["Fetch", "XHR"].includes(type)) {
      return;
    }
    requestMap.set(requestId, {
      url,
      status: response?.status || null,
      contentType,
    });
    return;
  }

  if (msg.method === "Network.loadingFinished") {
    const pending = requestMap.get(msg.params.requestId);
    if (!pending) {
      return;
    }
    requestMap.delete(msg.params.requestId);

    try {
      const body = await send("Network.getResponseBody", { requestId: msg.params.requestId }, 15000);
      const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
      const summary = summarizeBody(text, pending.contentType.toLowerCase());
      if (summary.bytes >= args.minBytes) {
        results.push({
          url: pending.url,
          status: pending.status,
          contentType: pending.contentType,
          ...summary,
        });
      }
    } catch (error) {
      results.push({
        url: pending.url,
        status: pending.status,
        contentType: pending.contentType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Network.enable");
    await send("Page.navigate", { url: args.navigateUrl }, 10000);
    setTimeout(() => {
      const sorted = [...results].sort((left, right) => (right.bytes || 0) - (left.bytes || 0)).slice(0, args.top);
      finish({
        ok: true,
        navigateUrl: args.navigateUrl,
        timeoutMs: args.timeoutMs,
        minBytes: args.minBytes,
        results: sorted,
      });
    }, args.timeoutMs);
  } catch (error) {
    finish({ ok: false, error: error instanceof Error ? error.message : String(error), results });
  }
});
