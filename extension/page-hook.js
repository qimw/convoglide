(() => {
  const DEBUG_EVENT = "__milkgpt_debug";
  const ROOT_ID = "client-created-root";
  const CONVERSATION_RESPONSE_RE = /\/backend-api\/conversation\/[0-9a-f-]+(?:\?|$)/i;
  const DEFAULT_MAX_MESSAGE_NODES = 80;

  function emit(detail) {
    try {
      window.dispatchEvent(
        new CustomEvent(DEBUG_EVENT, {
          detail,
        }),
      );
    } catch {}
  }

  function cloneValue(value) {
    return globalThis.structuredClone
      ? globalThis.structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function isMessageNode(node) {
    return !!node?.message;
  }

  function getMaxMessageNodes() {
    const raw = localStorage.getItem("milkgpt:max-message-nodes");
    const value = Number(raw || DEFAULT_MAX_MESSAGE_NODES);
    return Number.isFinite(value) && value > 10 ? Math.floor(value) : DEFAULT_MAX_MESSAGE_NODES;
  }

  function trimConversationPayload(payload, maxMessageNodes) {
    if (!payload || typeof payload !== "object" || !payload.mapping || !payload.current_node) {
      return { changed: false, payload, reason: "missing-shape" };
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

    if (branch.length === 0) {
      return { changed: false, payload, reason: "empty-branch" };
    }

    branch.reverse();

    let messageCount = 0;
    let startIndex = 0;

    for (let i = branch.length - 1; i >= 0; i -= 1) {
      if (isMessageNode(mapping[branch[i]])) {
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
        reason: "within-limit",
        beforeNodes: Object.keys(mapping).length,
        afterNodes: Object.keys(mapping).length,
        keptMessageNodes: branch.filter((id) => isMessageNode(mapping[id])).length,
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
      const nextId = keptIds[i + 1] || null;
      if (isMessageNode(original)) {
        keptMessageNodes += 1;
      }
      newMapping[id] = {
        ...cloneValue(original),
        parent: i === 0 ? ROOT_ID : keptIds[i - 1],
        children: nextId ? [nextId] : [],
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

  function maybeRewriteResponseText(url, text) {
    if (!CONVERSATION_RESPONSE_RE.test(url)) {
      return null;
    }

    const maxMessageNodes = getMaxMessageNodes();
    const payload = JSON.parse(text);
    const trimmed = trimConversationPayload(payload, maxMessageNodes);

    if (!trimmed.changed) {
      emit({
        phase: "fetch-pass",
        summary: `${trimmed.reason || "pass"} ${trimmed.afterNodes || 0} nodes`,
        url,
      });
      return null;
    }

    emit({
      phase: "fetch-trim",
      summary: `${trimmed.beforeNodes} -> ${trimmed.afterNodes} nodes (keep ${trimmed.keptMessageNodes})`,
      url,
    });

    return JSON.stringify(trimmed.payload);
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const request = args[0];
      const url =
        typeof request === "string"
          ? request
          : request instanceof Request
            ? request.url
            : String(request);

      if (!CONVERSATION_RESPONSE_RE.test(url)) {
        return response;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        emit({
          phase: "fetch-skip",
          summary: `non-json ${contentType || "unknown"}`,
          url,
        });
        return response;
      }

      const rawText = await response.clone().text();
      const rewrittenText = maybeRewriteResponseText(url, rawText);
      if (!rewrittenText) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.set("x-milkgpt", "fetch-trim");

      return new Response(rewrittenText, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      emit({
        phase: "fetch-error",
        summary: error instanceof Error ? error.message : String(error),
        url: location.pathname,
      });
      return response;
    }
  };

  emit({
    phase: "page-hook",
    summary: `installed keep=${getMaxMessageNodes()}`,
    url: location.pathname,
  });
})();
