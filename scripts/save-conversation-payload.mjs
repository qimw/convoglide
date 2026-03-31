import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createCdpClient, getFirstPageTarget, waitForDebuggerTargets } from './cdp.js';

const conversationId = process.argv[2];
const outFile = process.argv[3]
  ? resolve(process.cwd(), process.argv[3])
  : resolve(process.cwd(), `artifacts/payloads/${conversationId}.json`);
const navigateUrl = process.argv[4] || `https://chatgpt.com/g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/${conversationId}`;

if (!conversationId) {
  console.error('Usage: node scripts/save-conversation-payload.mjs <conversation-id> [out-file] [navigate-url]');
  process.exit(1);
}

await waitForDebuggerTargets({ timeoutMs: 20000, intervalMs: 500 });
const target = await getFirstPageTarget();
if (!target?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ ok: false, reason: 'no_target' }, null, 2));
  process.exit(0);
}

const { ws, send, close } = createCdpClient(target.webSocketDebuggerUrl);
let conversationRequestId = null;

function finish(payload) {
  console.log(JSON.stringify(payload, null, 2));
  close();
  process.exit(0);
}

ws.addEventListener('message', async (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Network.responseReceived') {
    const { response, requestId } = msg.params;
    if (response.url === `https://chatgpt.com/backend-api/conversation/${conversationId}`) {
      conversationRequestId = requestId;
    }
    return;
  }

  if (msg.method === 'Network.loadingFinished' && msg.params.requestId === conversationRequestId) {
    try {
      const body = await send('Network.getResponseBody', { requestId: conversationRequestId }, 15000);
      const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body;
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, text);
      finish({
        ok: true,
        conversationId,
        outFile,
        responseBytes: Buffer.byteLength(text, 'utf8'),
      });
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
});

ws.addEventListener('open', async () => {
  try {
    await send('Page.enable');
    await send('Network.enable');
    await send('Page.navigate', { url: navigateUrl }, 10000);
  } catch (error) {
    finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
