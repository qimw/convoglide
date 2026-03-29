import { createCdpClient, getFirstPageTarget } from "./cdp.js";

const conversationId =
  process.argv[2] || "699b2b0c-5dc4-8333-a6dd-e88ac7753511";
const navigateUrl =
  process.argv[3] ||
  `https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/${conversationId}`;

const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
let conversationRequestId = null;

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

function extractTextLength(message) {
  const parts = message?.content?.parts;
  if (!Array.isArray(parts)) return 0;
  let total = 0;
  for (const part of parts) {
    if (typeof part === "string") {
      total += part.length;
    } else if (part && typeof part === "object") {
      total += JSON.stringify(part).length;
    }
  }
  return total;
}

ws.addEventListener("message", async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.method === "Network.responseReceived") {
    const { response, requestId } = msg.params;
    if (response.url === `https://chatgpt.com/backend-api/conversation/${conversationId}`) {
      conversationRequestId = requestId;
    }
    return;
  }

  if (msg.method === "Network.loadingFinished" && msg.params.requestId === conversationRequestId) {
    try {
      const body = await send("Network.getResponseBody", { requestId: conversationRequestId }, 12000);
      const payload = JSON.parse(body.body);
      const mapping = payload.mapping || {};
      const ids = Object.keys(mapping);
      const branch = [];
      const seen = new Set();
      let cursor = payload.current_node;

      while (cursor && mapping[cursor] && !seen.has(cursor)) {
        branch.push(cursor);
        seen.add(cursor);
        cursor = mapping[cursor].parent;
      }

      branch.reverse();
      const branchMessages = branch.filter((id) => mapping[id]?.message);
      const recentMessages = branchMessages.slice(-20).map((id) => {
        const message = mapping[id]?.message;
        return {
          id,
          author: message?.author?.role || null,
          contentType: message?.content?.content_type || null,
          textChars: extractTextLength(message),
        };
      });

      finish({
        ok: true,
        responseBytes: Buffer.byteLength(body.body, "utf8"),
        mappingNodes: ids.length,
        branchNodes: branch.length,
        branchMessageNodes: branchMessages.length,
        currentNode: payload.current_node || null,
        largestRecentMessages: [...recentMessages].sort((a, b) => b.textChars - a.textChars).slice(0, 5),
      });
    } catch (error) {
      finish({ ok: false, error: error.message });
    }
  }
});

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Network.enable");
    await send("Page.navigate", { url: navigateUrl }, 10000);
  } catch (error) {
    finish({ ok: false, error: error.message });
  }
});
