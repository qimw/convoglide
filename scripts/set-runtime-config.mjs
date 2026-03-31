import { createCdpClient, getFirstPageTarget, waitForDebuggerTargets } from "./cdp.js";

function parseArgs(argv) {
  const args = {
    url: "https://chatgpt.com/",
    maxMessageNodes: null,
    bootstrapMaxMessageNodes: null,
    clearMaxMessageNodes: false,
    clearBootstrapMaxMessageNodes: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--url") {
      args.url = argv[index + 1] || args.url;
      index += 1;
      continue;
    }
    if (arg === "--max-message-nodes") {
      args.maxMessageNodes = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--bootstrap-max-message-nodes") {
      args.bootstrapMaxMessageNodes = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--clear-max-message-nodes") {
      args.clearMaxMessageNodes = true;
      continue;
    }
    if (arg === "--clear-bootstrap-max-message-nodes") {
      args.clearBootstrapMaxMessageNodes = true;
      continue;
    }
  }

  return args;
}

function buildExpression(args) {
  const steps = [];
  if (args.clearMaxMessageNodes) {
    steps.push("localStorage.removeItem('convoglide:max-message-nodes')");
  }
  if (args.clearBootstrapMaxMessageNodes) {
    steps.push("localStorage.removeItem('convoglide:bootstrap-max-message-nodes')");
  }
  if (Number.isFinite(args.maxMessageNodes)) {
    steps.push(`localStorage.setItem('convoglide:max-message-nodes', '${Math.floor(args.maxMessageNodes)}')`);
  }
  if (Number.isFinite(args.bootstrapMaxMessageNodes)) {
    steps.push(
      `localStorage.setItem('convoglide:bootstrap-max-message-nodes', '${Math.floor(args.bootstrapMaxMessageNodes)}')`,
    );
  }

  steps.push(`({
    maxMessageNodes: localStorage.getItem('convoglide:max-message-nodes'),
    bootstrapMaxMessageNodes: localStorage.getItem('convoglide:bootstrap-max-message-nodes'),
    href: location.href,
  })`);

  return `(() => { ${steps.join('; ')}; })()`;
}

const args = parseArgs(process.argv.slice(2));
await waitForDebuggerTargets({ timeoutMs: 20000, intervalMs: 500 });
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
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", { url: args.url }, 10000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const result = await send(
      "Runtime.evaluate",
      {
        expression: buildExpression(args),
        returnByValue: true,
      },
      10000,
    );
    finish({ ok: true, ...result.result.value });
  } catch (error) {
    finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
