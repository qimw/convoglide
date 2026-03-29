function installConvoGlideChatGPTRuntime(options = {}) {
  const ROOT_ID = "convoglide-root";
  const CONVERSATION_RESPONSE_RE = /\/backend-api\/conversation\/[0-9a-f-]+(?:\?|$)/i;
  const DEFAULT_MAX_MESSAGE_NODES = 80;
  const DEFAULT_KEEP_TAIL_TURNS = 12;
  const DEFAULT_VIEWPORT_BUFFER_PX = 1800;
  const DEFAULT_MIN_TURN_HEIGHT_PX = 160;
  const threadSelectors = ["#thread", "main"];

  const responseHeaderName = options.responseHeaderName || "x-convoglide";
  const responseHeaderValue = options.responseHeaderValue || "trim";
  const maxMessageNodesStorageKey = options.maxMessageNodesStorageKey || "convoglide:max-message-nodes";
  const virtualization = {
    enabled: options.virtualization?.enabled !== false,
    keepTailTurns: Number.isFinite(options.virtualization?.keepTailTurns)
      ? Math.max(4, Math.floor(options.virtualization.keepTailTurns))
      : DEFAULT_KEEP_TAIL_TURNS,
    viewportBufferPx: Number.isFinite(options.virtualization?.viewportBufferPx)
      ? Math.max(600, Math.floor(options.virtualization.viewportBufferPx))
      : DEFAULT_VIEWPORT_BUFFER_PX,
    minTurnHeightPx: Number.isFinite(options.virtualization?.minTurnHeightPx)
      ? Math.max(80, Math.floor(options.virtualization.minTurnHeightPx))
      : DEFAULT_MIN_TURN_HEIGHT_PX,
  };

  function notify(detail = {}) {
    try {
      window.__CONVOGLIDE_STATE = detail;
    } catch {}

    try {
      const events = Array.isArray(window.__CONVOGLIDE_EVENTS) ? window.__CONVOGLIDE_EVENTS : [];
      events.push({
        at: Date.now(),
        ...detail,
      });
      window.__CONVOGLIDE_EVENTS = events.slice(-50);
    } catch {}

    if (typeof options.report === "function") {
      options.report(detail);
    }
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
    const raw = localStorage.getItem(maxMessageNodesStorageKey);
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
      notify({
        phase: "fetch-pass",
        summary: `${trimmed.reason || "pass"} ${trimmed.afterNodes || 0} nodes`,
        url,
      });
      return null;
    }

    notify({
      phase: "fetch-trim",
      summary: `${trimmed.beforeNodes} -> ${trimmed.afterNodes} nodes (keep ${trimmed.keptMessageNodes})`,
      url,
    });

    return JSON.stringify(trimmed.payload);
  }

  function installFetchHook() {
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
          notify({
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
        headers.set(responseHeaderName, responseHeaderValue);

        return new Response(rewrittenText, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (error) {
        notify({
          phase: "fetch-error",
          summary: error instanceof Error ? error.message : String(error),
          url: location.pathname,
        });
        return response;
      }
    };
  }

  function createTurnVirtualizer() {
    const snapshots = new WeakMap();
    let scheduled = false;
    let threadRoot = null;
    let threadObserver = null;
    let discoveryObserver = null;
    let pauseUntil = 0;
    let lastSummary = "";

    function findThreadRoot() {
      for (const selector of threadSelectors) {
        const node = document.querySelector(selector);
        if (node) {
          return node;
        }
      }
      return null;
    }

    function getTurnElements(root) {
      if (!root) {
        return [];
      }

      const sections = Array.from(root.querySelectorAll('section[data-testid^="conversation-turn-"]'));
      if (sections.length) {
        return sections;
      }

      const articles = Array.from(root.querySelectorAll("article"));
      if (articles.length) {
        return articles;
      }

      return Array.from(root.querySelectorAll("[data-message-id]")).filter((element) => {
        const parentMessage = element.parentElement?.closest?.("[data-message-id]");
        return !parentMessage;
      });
    }

    function restoreTurn(turn) {
      const snapshot = snapshots.get(turn);
      if (!snapshot) {
        return false;
      }

      turn.replaceChildren(...snapshot.nodes);
      turn.style.minHeight = "";
      turn.removeAttribute("data-convoglide-virtualized");
      snapshots.delete(turn);
      return true;
    }

    function restoreAllTurns(root = threadRoot) {
      if (!root) {
        return;
      }
      for (const turn of getTurnElements(root)) {
        restoreTurn(turn);
      }
    }

    function virtualizeTurn(turn) {
      if (snapshots.has(turn)) {
        return false;
      }
      if (turn.contains(document.activeElement)) {
        return false;
      }

      const nodes = Array.from(turn.childNodes);
      if (!nodes.length) {
        return false;
      }

      const rect = turn.getBoundingClientRect();
      const height = Math.max(
        virtualization.minTurnHeightPx,
        Math.ceil(rect.height || 0),
        Math.ceil(turn.offsetHeight || 0),
      );

      const placeholder = document.createElement("div");
      placeholder.className = "convoglide-placeholder";
      placeholder.style.height = `${height}px`;
      placeholder.innerHTML = [
        '<span class="convoglide-placeholder__label">ConvoGlide virtualized off-screen content</span>',
      ].join("");

      snapshots.set(turn, {
        nodes,
        height,
      });
      turn.replaceChildren(placeholder);
      turn.style.minHeight = `${height}px`;
      turn.setAttribute("data-convoglide-virtualized", "true");
      return true;
    }

    function shouldVirtualizeTurn(turn) {
      const rect = turn.getBoundingClientRect();
      const buffer = virtualization.viewportBufferPx;
      return rect.bottom < -buffer || rect.top > window.innerHeight + buffer;
    }

    function summarize(turns, virtualizedCount) {
      const summary = `virtualized ${virtualizedCount}/${turns.length} turns`;
      if (summary !== lastSummary) {
        lastSummary = summary;
        notify({
          phase: "virtualizer",
          summary,
          url: location.pathname,
        });
      }
    }

    function run() {
      if (!threadRoot || !threadRoot.isConnected) {
        attach(findThreadRoot());
        return;
      }

      if (Date.now() < pauseUntil) {
        restoreAllTurns(threadRoot);
        summarize(getTurnElements(threadRoot), 0);
        return;
      }

      const turns = getTurnElements(threadRoot);
      if (!turns.length) {
        return;
      }

      const keepTailStart = Math.max(0, turns.length - virtualization.keepTailTurns);
      let virtualizedCount = 0;

      for (let index = 0; index < turns.length; index += 1) {
        const turn = turns[index];
        if (index >= keepTailStart) {
          restoreTurn(turn);
          continue;
        }

        if (shouldVirtualizeTurn(turn)) {
          if (virtualizeTurn(turn)) {
            virtualizedCount += 1;
          } else if (snapshots.has(turn)) {
            virtualizedCount += 1;
          }
        } else {
          restoreTurn(turn);
        }
      }

      summarize(turns, virtualizedCount);
    }

    function schedule() {
      if (scheduled) {
        return;
      }
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        run();
      });
    }

    function attach(root) {
      if (!root) {
        return;
      }
      if (threadRoot === root) {
        schedule();
        return;
      }

      threadRoot = root;
      threadObserver?.disconnect();
      threadObserver = new MutationObserver(() => {
        schedule();
      });
      threadObserver.observe(threadRoot, {
        childList: true,
        subtree: true,
      });
      schedule();
    }

    function watchForThreadRoot() {
      const root = findThreadRoot();
      if (root) {
        discoveryObserver?.disconnect();
        attach(root);
        return;
      }

      if (discoveryObserver) {
        return;
      }

      discoveryObserver = new MutationObserver(() => {
        const nextRoot = findThreadRoot();
        if (nextRoot) {
          discoveryObserver?.disconnect();
          discoveryObserver = null;
          attach(nextRoot);
        }
      });
      discoveryObserver.observe(document, {
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule, { once: true });

    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        pauseUntil = Date.now() + 15000;
        restoreAllTurns(threadRoot);
        notify({
          phase: "virtualizer-pause",
          summary: "pause virtualization for in-page search",
          url: location.pathname,
        });
        setTimeout(schedule, 16000);
      }
    });

    watchForThreadRoot();
  }

  function installVirtualizer() {
    if (!virtualization.enabled) {
      return;
    }
    createTurnVirtualizer();
  }

  installFetchHook();
  installVirtualizer();

  const api = {
    getEvents() {
      return Array.isArray(window.__CONVOGLIDE_EVENTS) ? [...window.__CONVOGLIDE_EVENTS] : [];
    },
    getMaxMessageNodes,
    setMaxMessageNodes(value) {
      const nextValue = Math.max(20, Math.floor(Number(value) || DEFAULT_MAX_MESSAGE_NODES));
      localStorage.setItem(maxMessageNodesStorageKey, String(nextValue));
      notify({
        phase: "config",
        summary: `set keep=${nextValue}; reload to apply`,
        url: location.pathname,
      });
      return nextValue;
    },
    clearMaxMessageNodes() {
      localStorage.removeItem(maxMessageNodesStorageKey);
      notify({
        phase: "config",
        summary: `reset keep=${DEFAULT_MAX_MESSAGE_NODES}; reload to apply`,
        url: location.pathname,
      });
    },
  };

  window.ConvoGlide = api;
  notify({
    phase: options.mode || "runtime",
    summary: `installed keep=${getMaxMessageNodes()}`,
    url: location.pathname,
  });
  return api;
}
