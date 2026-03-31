import { createCdpClient, getFirstPageTarget } from "./cdp.js";

function parseArgs(argv) {
  const args = {
    action: "show",
    clearConversation: false,
    clearAuxiliary: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (["show", "clear"].includes(arg)) {
      args.action = arg;
      continue;
    }
    if (arg === "--conversation") {
      args.clearConversation = true;
      continue;
    }
    if (arg === "--auxiliary") {
      args.clearAuxiliary = true;
      continue;
    }
    if (arg === "--all") {
      args.clearConversation = true;
      args.clearAuxiliary = true;
    }
  }

  if (args.action === "clear" && !args.clearConversation && !args.clearAuxiliary) {
    args.clearConversation = true;
    args.clearAuxiliary = true;
  }

  return args;
}

function makeExpression(args) {
  if (args.action === "clear") {
    return `(() => {
      const cleared = [];
      if (${String(args.clearConversation)}) {
        localStorage.removeItem('convoglide:conversation-cache');
        cleared.push('conversation');
      }
      if (${String(args.clearAuxiliary)}) {
        localStorage.removeItem('convoglide:auxiliary-cache');
        cleared.push('auxiliary');
      }
      const conversationCache = localStorage.getItem('convoglide:conversation-cache');
      const auxiliaryCache = localStorage.getItem('convoglide:auxiliary-cache');
      return {
        action: 'clear',
        cleared,
        conversationBytes: conversationCache ? conversationCache.length : 0,
        conversationEntryCount: conversationCache ? Object.keys(JSON.parse(conversationCache)).length : 0,
        auxiliaryBytes: auxiliaryCache ? auxiliaryCache.length : 0,
        auxiliaryEntryCount: auxiliaryCache ? Object.keys(JSON.parse(auxiliaryCache)).length : 0,
      };
    })()`;
  }

  return `(() => {
    const conversationCache = localStorage.getItem('convoglide:conversation-cache');
    const auxiliaryCache = localStorage.getItem('convoglide:auxiliary-cache');
    return {
      action: 'show',
      conversationBytes: conversationCache ? conversationCache.length : 0,
      conversationEntryCount: conversationCache ? Object.keys(JSON.parse(conversationCache)).length : 0,
      auxiliaryBytes: auxiliaryCache ? auxiliaryCache.length : 0,
      auxiliaryEntryCount: auxiliaryCache ? Object.keys(JSON.parse(auxiliaryCache)).length : 0,
      conversationKeys: conversationCache ? Object.keys(JSON.parse(conversationCache)).slice(0, 10) : [],
      auxiliaryKeys: auxiliaryCache ? Object.keys(JSON.parse(auxiliaryCache)).slice(0, 10) : [],
    };
  })()`;
}

const args = parseArgs(process.argv.slice(2));
const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: "no_target" }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

ws.addEventListener("open", async () => {
  try {
    await send("Runtime.enable");
    const result = await send(
      "Runtime.evaluate",
      {
        expression: makeExpression(args),
        returnByValue: true,
      },
      10000,
    );
    finish({ ok: true, ...result.result.value });
  } catch (error) {
    finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
