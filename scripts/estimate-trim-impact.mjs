import { createCdpClient, getFirstPageTarget } from "./cdp.js";

const conversationId =
  process.argv[2] || "699b2b0c-5dc4-8333-a6dd-e88ac7753511";
const navigateUrl =
  process.argv[3] ||
  `https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/${conversationId}`;
const caps = [160, 120, 80, 40, 20];
const ROOT_ID = "client-created-root";

function cloneValue(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function isMessageNode(node) {
  return !!node?.message;
}

function getMessageRole(node) {
  return node?.message?.author?.role || null;
}

function isUserFacingMessageNode(node) {
  const role = getMessageRole(node);
  return role === "user" || role === "assistant";
}

function trimConversationPayload(payload, maxMessageNodes) {
  if (!payload?.mapping || !payload?.current_node) {
    return { changed: false, payload };
  }

  const mapping = payload.mapping;
  const branch = [];
  const seen = new Set();
  let cursor = payload.current_node;

  while (cursor && mapping[cursor] && !seen.has(cursor)) {
    branch.push(cursor);
    seen.add(cursor);
    cursor = mapping[cursor].parent;
  }

  branch.reverse();

  let messageCount = 0;
  let startIndex = 0;
  for (let i = branch.length - 1; i >= 0; i -= 1) {
    if (isUserFacingMessageNode(mapping[branch[i]])) {
      messageCount += 1;
    }
    if (messageCount > maxMessageNodes) {
      startIndex = i + 1;
      break;
    }
  }

  if (startIndex === 0) {
    return {
      changed: false,
      payload,
      beforeNodes: Object.keys(mapping).length,
      afterNodes: Object.keys(mapping).length,
      keptMessageNodes: branch.filter((id) => isUserFacingMessageNode(mapping[id])).length,
    };
  }

  const keptIds = branch.slice(startIndex);
  const rootTemplate = mapping[ROOT_ID] || {
    id: ROOT_ID,
    message: null,
    parent: null,
    children: [],
  };

  const newMapping = {
    [ROOT_ID]: {
      ...cloneValue(rootTemplate),
      parent: null,
      children: keptIds.length ? [keptIds[0]] : [],
    },
  };

  let keptMessageNodes = 0;
  for (let i = 0; i < keptIds.length; i += 1) {
    const id = keptIds[i];
    const original = mapping[id];
    if (!original) continue;
    if (isUserFacingMessageNode(original)) {
      keptMessageNodes += 1;
    }
    newMapping[id] = {
      ...cloneValue(original),
      parent: i === 0 ? ROOT_ID : keptIds[i - 1],
      children: keptIds[i + 1] ? [keptIds[i + 1]] : [],
    };
  }

  return {
    changed: true,
    payload: {
      ...payload,
      mapping: newMapping,
    },
    beforeNodes: Object.keys(mapping).length,
    afterNodes: Object.keys(newMapping).length,
    keptMessageNodes,
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
      const originalBytes = Buffer.byteLength(body.body, "utf8");
      const results = caps.map((cap) => {
        const trimmed = trimConversationPayload(payload, cap);
        const nextBody = JSON.stringify(trimmed.payload);
        const nextBytes = Buffer.byteLength(nextBody, "utf8");
        const reductionBytes = originalBytes - nextBytes;
        return {
          maxMessageNodes: cap,
          beforeNodes: trimmed.beforeNodes,
          afterNodes: trimmed.afterNodes,
          keptMessageNodes: trimmed.keptMessageNodes,
          nextBytes,
          reductionBytes,
          reductionPct: Number(((reductionBytes / originalBytes) * 100).toFixed(2)),
        };
      });
      finish({ ok: true, originalBytes, caps: results });
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
