export async function getTargets(debugUrl = "http://127.0.0.1:9223/json/list") {
  const response = await fetch(debugUrl);
  return response.json();
}

export async function getFirstPageTarget(debugUrl = "http://127.0.0.1:9223/json/list") {
  const targets = await getTargets(debugUrl);
  return targets.find((target) => target.type === "page") || null;
}

export async function waitForDebuggerTargets({
  debugUrl = "http://127.0.0.1:9223/json/list",
  timeoutMs = 20000,
  intervalMs = 500,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const targets = await getTargets(debugUrl);
      if (Array.isArray(targets) && targets.length) {
        return targets;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw lastError || new Error(`Debugger targets not ready within ${timeoutMs}ms`);
}

export function createCdpClient(webSocketDebuggerUrl) {
  if (!webSocketDebuggerUrl) {
    throw new Error("Missing websocket debugger url");
  }

  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);

    if (message.error) {
      reject(new Error(message.error.message));
      return;
    }

    resolve(message.result);
  });

  function send(method, params = {}, timeoutMs = 6000) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout:${method}`));
        }
      }, timeoutMs);
    });
  }

  function close() {
    try {
      ws.close();
    } catch {}
  }

  return { ws, send, close };
}
