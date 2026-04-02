export function extractActiveBranchIds(payload) {
  const mapping = payload?.mapping;
  const currentNode = payload?.current_node;
  if (!mapping || typeof mapping !== 'object' || !currentNode) {
    return [];
  }

  const branch = [];
  const seen = new Set();
  let cursor = currentNode;

  while (cursor && mapping[cursor] && !seen.has(cursor)) {
    branch.push(cursor);
    seen.add(cursor);
    cursor = mapping[cursor].parent;
  }

  return branch.reverse();
}

export function getNodeRole(node) {
  return node?.message?.author?.role || null;
}

export function isUserFacingRole(role) {
  return role === 'user' || role === 'assistant';
}

export function isStructuralRole(role) {
  return role === 'system' || role === 'tool';
}

export function extractTextLength(message) {
  const parts = message?.content?.parts;
  if (!Array.isArray(parts)) return 0;
  let total = 0;
  for (const part of parts) {
    if (typeof part === 'string') {
      total += part.length;
    } else if (part && typeof part === 'object') {
      total += JSON.stringify(part).length;
    }
  }
  return total;
}

export function summarizePayload(payload) {
  const mapping = payload?.mapping || {};
  const branchIds = extractActiveBranchIds(payload);
  const branchEntries = branchIds.map((id) => ({ id, node: mapping[id], role: getNodeRole(mapping[id]) }));
  const branchMessages = branchEntries.filter((entry) => entry.node?.message);
  const userMessages = branchMessages.filter((entry) => entry.role === 'user');
  const assistantMessages = branchMessages.filter((entry) => entry.role === 'assistant');

  let qaRounds = 0;
  for (let index = 0; index < branchMessages.length - 1; index += 1) {
    if (branchMessages[index].role === 'user' && branchMessages[index + 1].role === 'assistant') {
      qaRounds += 1;
    }
  }

  const roleCounts = branchMessages.reduce((acc, entry) => {
    const key = entry.role || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const avg = (items) => {
    if (!items.length) return 0;
    return Math.round(items.reduce((sum, entry) => sum + extractTextLength(entry.node.message), 0) / items.length);
  };

  return {
    responseBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
    mappingNodes: Object.keys(mapping).length,
    branchNodes: branchIds.length,
    branchMessageNodes: branchMessages.length,
    qaRounds,
    roleCounts,
    avgMessageChars: avg(branchMessages),
    avgUserChars: avg(userMessages),
    avgAssistantChars: avg(assistantMessages),
    lastRoles: branchMessages.slice(-12).map((entry) => entry.role),
  };
}

export function trimByVisibleMessages(payload, maxVisibleMessages, rootId = 'convoglide-root') {
  const mapping = payload?.mapping;
  const branchIds = extractActiveBranchIds(payload);
  if (!mapping || !branchIds.length) {
    return { changed: false, keptIds: [], payload };
  }

  let visibleCount = 0;
  let startIndex = 0;
  for (let i = branchIds.length - 1; i >= 0; i -= 1) {
    const role = getNodeRole(mapping[branchIds[i]]);
    if (isUserFacingRole(role)) {
      visibleCount += 1;
    }
    if (visibleCount > maxVisibleMessages) {
      startIndex = i + 1;
      break;
    }
  }

  startIndex = expandStartIndexForStructuralContext(branchIds, mapping, startIndex);
  const keptIds = branchIds.slice(startIndex);
  return buildTrimmedPayload(payload, keptIds, rootId, { strategy: 'visible-message', maxVisibleMessages });
}

export function trimByRecentTurns(payload, turnCount, rootId = 'convoglide-root') {
  const mapping = payload?.mapping;
  const branchIds = extractActiveBranchIds(payload);
  if (!mapping || !branchIds.length) {
    return { changed: false, keptIds: [], payload };
  }

  const userIndexes = [];
  for (let index = 0; index < branchIds.length; index += 1) {
    if (getNodeRole(mapping[branchIds[index]]) === 'user') {
      userIndexes.push(index);
    }
  }

  if (!userIndexes.length) {
    return buildTrimmedPayload(payload, branchIds, rootId, { strategy: 'turn-window', turnCount });
  }

  const targetUserOffset = Math.max(0, userIndexes.length - turnCount);
  const startIndex = expandStartIndexForStructuralContext(
    branchIds,
    mapping,
    userIndexes[targetUserOffset] ?? 0,
  );
  const keptIds = branchIds.slice(startIndex);
  return buildTrimmedPayload(payload, keptIds, rootId, { strategy: 'turn-window', turnCount });
}

function expandStartIndexForStructuralContext(branchIds, mapping, startIndex) {
  let nextStartIndex = Math.max(0, Math.floor(startIndex || 0));
  while (nextStartIndex > 0) {
    const previousRole = getNodeRole(mapping?.[branchIds[nextStartIndex - 1]]);
    if (!isStructuralRole(previousRole)) {
      break;
    }
    nextStartIndex -= 1;
  }
  return nextStartIndex;
}

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function buildTrimmedPayload(payload, keptIds, rootId, meta = {}) {
  const mapping = payload?.mapping || {};
  const rootTemplate = mapping[rootId] || {
    id: rootId,
    message: null,
    parent: null,
    children: [],
  };

  const newMapping = {
    [rootId]: {
      ...clone(rootTemplate),
      parent: null,
      children: keptIds.length ? [keptIds[0]] : [],
    },
  };

  let keptVisibleMessages = 0;
  let keptTurns = 0;
  let textChars = 0;
  const keptRoles = [];
  let sawUser = false;
  let assistantAfterLastUser = 0;
  const roleCounts = {};

  for (let index = 0; index < keptIds.length; index += 1) {
    const id = keptIds[index];
    const original = mapping[id];
    if (!original) continue;
    const nextId = keptIds[index + 1] || null;
    const role = getNodeRole(original);
    const textLength = extractTextLength(original?.message);
    textChars += textLength;
    keptRoles.push(role || 'none');
    roleCounts[role || 'none'] = (roleCounts[role || 'none'] || 0) + 1;
    if (isUserFacingRole(role)) {
      keptVisibleMessages += 1;
    }
    if (role === 'user') {
      keptTurns += 1;
      sawUser = true;
      assistantAfterLastUser = 0;
    } else if (role === 'assistant' && sawUser) {
      assistantAfterLastUser += 1;
    }

    newMapping[id] = {
      ...clone(original),
      parent: index === 0 ? rootId : keptIds[index - 1],
      children: nextId ? [nextId] : [],
    };
  }

  return {
    changed: true,
    keptIds,
    payload: {
      ...payload,
      mapping: newMapping,
    },
    summary: {
      strategy: meta.strategy || 'unknown',
      maxVisibleMessages: meta.maxVisibleMessages ?? null,
      turnCount: meta.turnCount ?? null,
      beforeNodes: Object.keys(mapping).length,
      afterNodes: Object.keys(newMapping).length,
      bytes: Buffer.byteLength(JSON.stringify({ ...payload, mapping: newMapping }), 'utf8'),
      keptVisibleMessages,
      keptTurns,
      textChars,
      roleCounts,
      keptRoles,
      terminalRole: keptRoles.at(-1) || null,
      completeTailAnswer: assistantAfterLastUser > 0,
      retainedStructuralNodes: (roleCounts.system || 0) + (roleCounts.tool || 0),
    },
  };
}

export function scoreTrimHeuristics(summary) {
  const warnings = [];
  let score = 100;

  if ((summary.keptTurns || 0) < 2) {
    score -= 35;
    warnings.push('keeps fewer than 2 recent user turns');
  }
  if (!summary.completeTailAnswer) {
    score -= 25;
    warnings.push('latest kept user turn does not end with an assistant answer');
  }
  if ((summary.afterNodes || 0) < 5) {
    score -= 20;
    warnings.push('kept node count is extremely small');
  }
  if ((summary.retainedStructuralNodes || 0) === 0) {
    score -= 10;
    warnings.push('kept slice contains no nearby system/tool nodes');
  }
  if (summary.terminalRole !== 'assistant') {
    score -= 10;
    warnings.push('terminal kept role is not assistant');
  }

  let risk = 'low';
  if (score < 80) risk = 'medium';
  if (score < 55) risk = 'high';

  return { score: Math.max(0, score), risk, warnings };
}
