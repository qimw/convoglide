import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

function loadRuntimeHelpers() {
  const runtimePath = resolve(process.cwd(), "src/runtime/chatgpt-core.js");
  const source = readFileSync(runtimePath, "utf8");
  const context = {
    console,
    globalThis: {},
  };
  context.globalThis = context;

  vm.runInNewContext(
    `${source}
globalThis.__convoglideTestHelpers = {
  convoglideExtractActiveBranchIds,
  convoglideFindTurnWindowStartIndex,
  convoglideResolveBootstrapMaxMessageNodes,
  convoglideResolveBootstrapTurnWindow,
  convoglideTrimConversationPayload,
  convoglideShouldVirtualizeRect,
  convoglideClassifyHeavyBlockMetrics,
};`,
    context,
    { filename: "chatgpt-core.js" },
  );

  return context.__convoglideTestHelpers;
}

const {
  convoglideExtractActiveBranchIds,
  convoglideFindTurnWindowStartIndex,
  convoglideResolveBootstrapMaxMessageNodes,
  convoglideResolveBootstrapTurnWindow,
  convoglideTrimConversationPayload,
  convoglideShouldVirtualizeRect,
  convoglideClassifyHeavyBlockMetrics,
} = loadRuntimeHelpers();

function createMessageNode(id, parent, children = []) {
  return {
    id,
    parent,
    children,
    message: {
      id: `message-${id}`,
      author: {
        role: "user",
      },
      content: {
        content_type: "text",
        parts: [`part-${id}`],
      },
    },
  };
}

function createRoleNode(id, role, parent, children = [], text = `part-${id}`) {
  return {
    id,
    parent,
    children,
    message: {
      id: `message-${id}`,
      author: {
        role,
      },
      content: {
        content_type: "text",
        parts: [text],
      },
    },
  };
}

test("convoglideExtractActiveBranchIds rebuilds the active branch order from current_node", () => {
  const payload = {
    current_node: "turn-4",
    mapping: {
      "convoglide-root": {
        id: "convoglide-root",
        parent: null,
        children: ["turn-1"],
        message: null,
      },
      "turn-1": createMessageNode("turn-1", "convoglide-root", ["turn-2"]),
      "turn-2": createMessageNode("turn-2", "turn-1", ["turn-3"]),
      "turn-3": createMessageNode("turn-3", "turn-2", ["turn-4"]),
      "turn-4": createMessageNode("turn-4", "turn-3", []),
      "side-1": createMessageNode("side-1", "turn-2", []),
    },
  };

  assert.deepEqual(Array.from(convoglideExtractActiveBranchIds(payload)), [
    "convoglide-root",
    "turn-1",
    "turn-2",
    "turn-3",
    "turn-4",
  ]);
});

test("convoglideResolveBootstrapMaxMessageNodes clamps the cold-start bootstrap window", () => {
  assert.equal(convoglideResolveBootstrapMaxMessageNodes(8), 4);
  assert.equal(convoglideResolveBootstrapMaxMessageNodes(6, { bootstrapMaxMessageNodes: 5 }), 5);
  assert.equal(convoglideResolveBootstrapMaxMessageNodes(4), 4);
  assert.equal(convoglideResolveBootstrapMaxMessageNodes(8, { bootstrapMaxMessageNodes: 2 }), 2);
});

test("convoglideResolveBootstrapTurnWindow clamps turn-window bootstrap to a safe range", () => {
  assert.equal(convoglideResolveBootstrapTurnWindow(8), 3);
  assert.equal(convoglideResolveBootstrapTurnWindow(8, { bootstrapTurnWindow: 4 }), 4);
  assert.equal(convoglideResolveBootstrapTurnWindow(4), 2);
  assert.equal(convoglideResolveBootstrapTurnWindow(4, { bootstrapTurnWindow: 9 }), 2);
});

test("convoglideTrimConversationPayload trims the active branch to the newest message nodes", () => {
  const payload = {
    current_node: "turn-4",
    mapping: {
      "convoglide-root": {
        id: "convoglide-root",
        parent: null,
        children: ["turn-1"],
        message: null,
      },
      "turn-1": createMessageNode("turn-1", "convoglide-root", ["turn-2"]),
      "turn-2": createMessageNode("turn-2", "turn-1", ["turn-3"]),
      "turn-3": createMessageNode("turn-3", "turn-2", ["turn-4"]),
      "turn-4": createMessageNode("turn-4", "turn-3", []),
    },
  };

  const result = convoglideTrimConversationPayload(payload, 2);

  assert.equal(result.changed, true);
  assert.equal(result.beforeNodes, 5);
  assert.equal(result.afterNodes, 3);
  assert.equal(result.keptMessageNodes, 2);
  assert.deepEqual(Object.keys(result.payload.mapping), ["convoglide-root", "turn-3", "turn-4"]);
  assert.deepEqual(Array.from(result.payload.mapping["convoglide-root"].children), ["turn-3"]);
  assert.equal(result.payload.mapping["turn-3"].parent, "convoglide-root");
  assert.deepEqual(Array.from(result.payload.mapping["turn-3"].children), ["turn-4"]);
  assert.equal(result.payload.mapping["turn-4"].parent, "turn-3");
  assert.deepEqual(Array.from(result.payload.mapping["turn-4"].children), []);
});

test("convoglideTrimConversationPayload leaves small active branches unchanged", () => {
  const payload = {
    current_node: "turn-2",
    mapping: {
      "convoglide-root": {
        id: "convoglide-root",
        parent: null,
        children: ["turn-1"],
        message: null,
      },
      "turn-1": createMessageNode("turn-1", "convoglide-root", ["turn-2"]),
      "turn-2": createMessageNode("turn-2", "turn-1", []),
    },
  };

  const result = convoglideTrimConversationPayload(payload, 4);

  assert.equal(result.changed, false);
  assert.equal(result.reason, "within-limit");
  assert.equal(result.beforeNodes, 3);
  assert.equal(result.afterNodes, 3);
  assert.equal(result.keptMessageNodes, 2);
});

test("convoglideTrimConversationPayload counts user-facing messages instead of raw internal nodes", () => {
  const payload = {
    current_node: "assistant-2",
    mapping: {
      "convoglide-root": {
        id: "convoglide-root",
        parent: null,
        children: ["user-1"],
        message: null,
      },
      "user-1": createRoleNode("user-1", "user", "convoglide-root", ["system-1"]),
      "system-1": createRoleNode("system-1", "system", "user-1", ["assistant-1"], ""),
      "assistant-1": createRoleNode("assistant-1", "assistant", "system-1", ["tool-1"]),
      "tool-1": createRoleNode("tool-1", "tool", "assistant-1", ["user-2"], ""),
      "user-2": createRoleNode("user-2", "user", "tool-1", ["system-2"]),
      "system-2": createRoleNode("system-2", "system", "user-2", ["assistant-2"], ""),
      "assistant-2": createRoleNode("assistant-2", "assistant", "system-2", []),
    },
  };

  const result = convoglideTrimConversationPayload(payload, 2);

  assert.equal(result.changed, true);
  assert.equal(result.keptMessageNodes, 2);
  assert.deepEqual(Array.from(Object.keys(result.payload.mapping)), [
    "convoglide-root",
    "tool-1",
    "user-2",
    "system-2",
    "assistant-2",
  ]);
});

test("convoglideFindTurnWindowStartIndex anchors bootstrap windows on recent user turns", () => {
  const payload = {
    current_node: "assistant-3",
    mapping: {
      "convoglide-root": {
        id: "convoglide-root",
        parent: null,
        children: ["user-1"],
        message: null,
      },
      "user-1": createRoleNode("user-1", "user", "convoglide-root", ["assistant-1"]),
      "assistant-1": createRoleNode("assistant-1", "assistant", "user-1", ["user-2"]),
      "user-2": createRoleNode("user-2", "user", "assistant-1", ["tool-1"]),
      "tool-1": createRoleNode("tool-1", "tool", "user-2", ["assistant-2"], ""),
      "assistant-2": createRoleNode("assistant-2", "assistant", "tool-1", ["user-3"]),
      "user-3": createRoleNode("user-3", "user", "assistant-2", ["system-1"]),
      "system-1": createRoleNode("system-1", "system", "user-3", ["assistant-3"], ""),
      "assistant-3": createRoleNode("assistant-3", "assistant", "system-1", []),
    },
  };

  const branch = convoglideExtractActiveBranchIds(payload);
  assert.equal(convoglideFindTurnWindowStartIndex(branch, payload.mapping, 1), 6);
  assert.equal(convoglideFindTurnWindowStartIndex(branch, payload.mapping, 2), 3);
  assert.equal(convoglideFindTurnWindowStartIndex(branch, payload.mapping, 3), 1);
});

test("convoglideTrimConversationPayload keeps structural nodes immediately before the kept turn window", () => {
  const payload = {
    current_node: "assistant-2",
    mapping: {
      "convoglide-root": {
        id: "convoglide-root",
        parent: null,
        children: ["user-1"],
        message: null,
      },
      "user-1": createRoleNode("user-1", "user", "convoglide-root", ["assistant-1"]),
      "assistant-1": createRoleNode("assistant-1", "assistant", "user-1", ["tool-1"]),
      "tool-1": createRoleNode("tool-1", "tool", "assistant-1", ["system-1"], ""),
      "system-1": createRoleNode("system-1", "system", "tool-1", ["user-2"], ""),
      "user-2": createRoleNode("user-2", "user", "system-1", ["assistant-2"]),
      "assistant-2": createRoleNode("assistant-2", "assistant", "user-2", []),
    },
  };

  const result = convoglideTrimConversationPayload(payload, 4, {
    mode: "turn-window",
    turnCount: 1,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(Array.from(Object.keys(result.payload.mapping)), [
    "convoglide-root",
    "tool-1",
    "system-1",
    "user-2",
    "assistant-2",
  ]);
});

test("convoglideTrimConversationPayload can trim by recent turn window", () => {
  const payload = {
    current_node: "assistant-3",
    mapping: {
      "convoglide-root": {
        id: "convoglide-root",
        parent: null,
        children: ["user-1"],
        message: null,
      },
      "user-1": createRoleNode("user-1", "user", "convoglide-root", ["assistant-1"]),
      "assistant-1": createRoleNode("assistant-1", "assistant", "user-1", ["user-2"]),
      "user-2": createRoleNode("user-2", "user", "assistant-1", ["tool-1"]),
      "tool-1": createRoleNode("tool-1", "tool", "user-2", ["assistant-2"], ""),
      "assistant-2": createRoleNode("assistant-2", "assistant", "tool-1", ["user-3"]),
      "user-3": createRoleNode("user-3", "user", "assistant-2", ["system-1"]),
      "system-1": createRoleNode("system-1", "system", "user-3", ["assistant-3"], ""),
      "assistant-3": createRoleNode("assistant-3", "assistant", "system-1", []),
    },
  };

  const result = convoglideTrimConversationPayload(payload, 4, {
    mode: "turn-window",
    turnCount: 2,
  });

  assert.equal(result.changed, true);
  assert.equal(result.mode, "turn-window");
  assert.equal(result.keptMessageNodes, 4);
  assert.deepEqual(Array.from(Object.keys(result.payload.mapping)), [
    "convoglide-root",
    "user-2",
    "tool-1",
    "assistant-2",
    "user-3",
    "system-1",
    "assistant-3",
  ]);
});

test("convoglideShouldVirtualizeRect only virtualizes rectangles outside the viewport buffer", () => {
  assert.equal(
    convoglideShouldVirtualizeRect({ top: 100, bottom: 400 }, 900, 1800),
    false,
  );
  assert.equal(
    convoglideShouldVirtualizeRect({ top: -2200, bottom: -1900 }, 900, 1800),
    true,
  );
  assert.equal(
    convoglideShouldVirtualizeRect({ top: 3100, bottom: 3400 }, 900, 1800),
    true,
  );
});

test("convoglideClassifyHeavyBlockMetrics classifies large blocks across height, text, and row count", () => {
  assert.equal(
    convoglideClassifyHeavyBlockMetrics({
      tagName: "div",
      height: 280,
      textLength: 100,
      rowCount: 0,
    }),
    true,
  );

  assert.equal(
    convoglideClassifyHeavyBlockMetrics({
      tagName: "pre",
      height: 120,
      textLength: 1500,
      rowCount: 0,
    }),
    true,
  );

  assert.equal(
    convoglideClassifyHeavyBlockMetrics({
      tagName: "table",
      height: 120,
      textLength: 200,
      rowCount: 8,
    }),
    true,
  );

  assert.equal(
    convoglideClassifyHeavyBlockMetrics({
      tagName: "pre",
      height: 120,
      textLength: 600,
      rowCount: 0,
    }),
    false,
  );
});
