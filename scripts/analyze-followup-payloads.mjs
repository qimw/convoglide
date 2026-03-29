import { createCdpClient, getFirstPageTarget } from "./cdp.js";

const conversationId =
  process.argv[2] || "699b2b0c-5dc4-8333-a6dd-e88ac7753511";
const navigateUrl =
  process.argv[3] ||
  `https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/${conversationId}`;
const targetsToCapture = [
  `https://chatgpt.com/backend-api/conversation/${conversationId}`,
  `https://chatgpt.com/backend-api/conversation/${conversationId}/textdocs`,
  "https://chatgpt.com/backend-api/conversation/init",
];

const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
const requestIds = new Map();
const payloads = [];

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

ws.addEventListener("message", async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.method === "Network.responseReceived") {
    const { response, requestId } = msg.params;
    if (targetsToCapture.includes(response.url)) {
      requestIds.set(requestId, response.url);
    }
    return;
  }

  if (msg.method === "Network.loadingFinished") {
    const url = requestIds.get(msg.params.requestId);
    if (!url) {
      return;
    }

    try {
      const body = await send("Network.getResponseBody", { requestId: msg.params.requestId }, 15000);
      const text = body.base64Encoded
        ? Buffer.from(body.body, "base64").toString("utf8")
        : body.body;
      payloads.push({
        url,
        bytes: Buffer.byteLength(text, "utf8"),
        preview: text.slice(0, 120),
      });
    } catch (error) {
      payloads.push({
        url,
        error: error.message,
      });
    }

    if (payloads.length === targetsToCapture.length) {
      finish({ ok: true, navigateUrl, payloads });
    }
  }
});

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Network.enable");
    await send("Page.navigate", { url: navigateUrl }, 10000);
    setTimeout(() => {
      finish({ ok: true, navigateUrl, payloads, partial: true });
    }, 35000);
  } catch (error) {
    finish({ ok: false, error: error.message, payloads });
  }
});
