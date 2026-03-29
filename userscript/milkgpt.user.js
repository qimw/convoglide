// ==UserScript==
// @name         MilkGPT
// @namespace    milkgpt.local
// @version      0.1.0
// @description  Prototype ChatGPT performance optimizer for very long conversations.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  const BADGE_ID = "milkgpt-badge";
  const STYLE_ID = "milkgpt-style";
  const ROOT_ID = "client-created-root";
  const CONVERSATION_RESPONSE_RE = /\/backend-api\/conversation\/[0-9a-f-]+(?:\?|$)/i;
  const DEFAULT_MAX_MESSAGE_NODES = 80;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --milkgpt-badge-bg: rgba(22, 28, 36, 0.92);
        --milkgpt-badge-fg: #f8fafc;
        --milkgpt-badge-muted: #cbd5e1;
        --milkgpt-badge-accent: #7dd3fc;
      }

      #milkgpt-badge {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        min-width: 180px;
        max-width: min(360px, calc(100vw - 32px));
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--milkgpt-badge-bg);
        color: var(--milkgpt-badge-fg);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.28);
        backdrop-filter: blur(10px);
        pointer-events: none;
      }

      #milkgpt-badge strong {
        display: block;
        margin-bottom: 4px;
        color: var(--milkgpt-badge-accent);
        font-size: 12px;
      }

      #milkgpt-badge .milkgpt-line {
        display: block;
        color: var(--milkgpt-badge-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #thread pre,
      #thread section[data-testid^="conversation-turn-"],
      #thread [data-message-id],
      #thread table,
      #thread img,
      #thread video,
      #thread canvas,
      #thread svg {
        content-visibility: auto !important;
        contain-intrinsic-size: auto 320px !important;
      }
    `;

    const parent = document.head || document.documentElement;
    parent?.appendChild(style);
  }

  function ensureBadge() {
    if (!document.body) {
      return null;
    }

    let badge = document.getElementById(BADGE_ID);
    if (badge) {
      return badge;
    }

    badge = document.createElement("aside");
    badge.id = BADGE_ID;
    badge.innerHTML = [
      "<strong>MilkGPT</strong>",
      '<span class="milkgpt-line" data-role="phase">phase: boot</span>',
      '<span class="milkgpt-line" data-role="detail">detail: starting</span>',
      '<span class="milkgpt-line" data-role="url">url: pending</span>',
    ].join("");
    document.body.appendChild(badge);
    return badge;
  }

  function updateBadge(detail = {}) {
    installStyle();
    const badge = ensureBadge();
    if (!badge) {
      return;
    }

    const phaseEl = badge.querySelector('[data-role="phase"]');
    const detailEl = badge.querySelector('[data-role="detail"]');
    const urlEl = badge.querySelector('[data-role="url"]');

    const phase = detail.phase || "boot";
    const summary = detail.summary || "idle";
    const url = detail.url || location.pathname;

    if (phaseEl) phaseEl.textContent = `phase: ${phase}`;
    if (detailEl) detailEl.textContent = `detail: ${summary}`;
    if (urlEl) urlEl.textContent = `url: ${url}`;

    try {
      document.documentElement.dataset.milkgptPhase = phase;
      document.documentElement.dataset.milkgptSummary = String(summary).slice(0, 120);
    } catch {}
  }

  function report(detail = {}) {
    try {
      window.__MILKGPT_STATE = detail;
    } catch {}

    try {
      const events = Array.isArray(window.__MILKGPT_EVENTS) ? window.__MILKGPT_EVENTS : [];
      events.push({
        at: Date.now(),
        ...detail,
      });
      window.__MILKGPT_EVENTS = events.slice(-30);
    } catch {}

    updateBadge(detail);
  }

  function deferBadgeMount() {
    if (ensureBadge()) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (ensureBadge()) {
        const state = window.__MILKGPT_STATE || {};
        updateBadge({
          phase: document.documentElement.dataset.milkgptPhase || state.phase || "boot",
          summary: document.documentElement.dataset.milkgptSummary || state.summary || "mounted",
          url: location.pathname,
        });
        observer.disconnect();
      }
    });

    observer.observe(document, {
      childList: true,
      subtree: true,
    });
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
      if (isMessageNode(original)) {
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

  function maybeRewriteResponseText(url, text) {
    if (!CONVERSATION_RESPONSE_RE.test(url)) {
      return null;
    }

    const maxMessageNodes = getMaxMessageNodes();
    const payload = JSON.parse(text);
    const trimmed = trimConversationPayload(payload, maxMessageNodes);

    if (!trimmed.changed) {
      report({
        phase: "fetch-pass",
        summary: `${trimmed.reason || "pass"} ${trimmed.afterNodes || 0} nodes`,
        url,
      });
      return null;
    }

    report({
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
        report({
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
      headers.set("x-milkgpt", "userscript-trim");

      return new Response(rewrittenText, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      report({
        phase: "fetch-error",
        summary: error instanceof Error ? error.message : String(error),
        url: location.pathname,
      });
      return response;
    }
  };

  installStyle();
  deferBadgeMount();
  window.MilkGPT = {
    getEvents: () => Array.isArray(window.__MILKGPT_EVENTS) ? [...window.__MILKGPT_EVENTS] : [],
    getMaxMessageNodes,
    setMaxMessageNodes(value) {
      const nextValue = Math.max(20, Math.floor(Number(value) || DEFAULT_MAX_MESSAGE_NODES));
      localStorage.setItem("milkgpt:max-message-nodes", String(nextValue));
      report({
        phase: "config",
        summary: `set keep=${nextValue}; reload to apply`,
        url: location.pathname,
      });
      return nextValue;
    },
    clearMaxMessageNodes() {
      localStorage.removeItem("milkgpt:max-message-nodes");
      report({
        phase: "config",
        summary: `reset keep=${DEFAULT_MAX_MESSAGE_NODES}; reload to apply`,
        url: location.pathname,
      });
    },
  };
  report({
    phase: "userscript",
    summary: `installed keep=${getMaxMessageNodes()}`,
    url: location.pathname,
  });
})();
