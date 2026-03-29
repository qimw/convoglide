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
