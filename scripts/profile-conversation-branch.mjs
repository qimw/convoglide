import { createCdpClient, getFirstPageTarget } from "./cdp.js";

const conversationId = process.argv[2] || "699b2b0c-5dc4-8333-a6dd-e88ac7753511";
const navigateUrl =
  process.argv[3] ||
  `https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/${conversationId}`;

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

function summarizeBranch(payload) {
  const mapping = payload?.mapping || {};
  const branch = [];
  const seen = new Set();
  let cursor = payload?.current_node;

  while (cursor && mapping[cursor] && !seen.has(cursor)) {
    branch.push(cursor);
    seen.add(cursor);
    cursor = mapping[cursor].parent;
  }

  branch.reverse();

  const branchMessages = branch
    .map((id) => {
      const message = mapping[id]?.message;
      if (!message) return null;
      return {
        id,
        role: message?.author?.role || null,
        contentType: message?.content?.content_type || null,
        textChars: extractTextLength(message),
      };
    })
    .filter(Boolean);

  let qaRounds = 0;
  for (let index = 0; index < branchMessages.length - 1; index += 1) {
    if (branchMessages[index].role === "user" && branchMessages[index + 1].role === "assistant") {
      qaRounds += 1;
    }
  }

  const roleCounts = branchMessages.reduce((acc, item) => {
    const key = item.role || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const contentTypeCounts = branchMessages.reduce((acc, item) => {
    const key = item.contentType || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const average = (items) => {
    if (!items.length) return 0;
    return Math.round(items.reduce((sum, item) => sum + item.textChars, 0) / items.length);
  };

  return {
    responseBytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
    mappingNodes: Object.keys(mapping).length,
    branchNodes: branch.length,
    branchMessageNodes: branchMessages.length,
    qaRounds,
    roleCounts,
    contentTypeCounts,
    avgMessageChars: average(branchMessages),
    avgUserChars: average(branchMessages.filter((item) => item.role === "user")),
    avgAssistantChars: average(branchMessages.filter((item) => item.role === "assistant")),
    first10Roles: branchMessages.slice(0, 10).map((item) => item.role),
    last10Messages: branchMessages.slice(-10),
    largestMessages: [...branchMessages].sort((left, right) => right.textChars - left.textChars).slice(0, 10),
  };
}

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
      finish({ ok: true, conversationId, ...summarizeBranch(payload) });
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
});

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Network.enable");
    await send("Page.navigate", { url: navigateUrl }, 10000);
  } catch (error) {
    finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
