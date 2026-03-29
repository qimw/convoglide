# Install

ConvoGlide currently ships two alpha install paths:

- **Userscript**
  - fastest path for most users
- **Browser extension**
  - better fit if you prefer a side-loaded extension package

## Userscript

Recommended for most non-technical users.

### What you need

- `Tampermonkey` on Chrome / Edge
- or `Violentmonkey` on Firefox-compatible browsers

### One-click install

1. Install a userscript manager.
2. Open the direct install URL:
   - <https://raw.githubusercontent.com/qimw/convoglide/main/userscript/convoglide.user.js>
3. Let your userscript manager install the script.
4. Open a long ChatGPT conversation.
5. Look for the `ConvoGlide` badge in the top-right corner.

### Manual install from this repository

1. Open [`userscript/convoglide.user.js`](../userscript/convoglide.user.js).
2. Copy the file content into a new script in your userscript manager.
3. Save it.

### Tuning

The default active-branch limit is `80` message nodes.

From the page console:

```js
window.ConvoGlide.setMaxMessageNodes(120)
window.ConvoGlide.clearMaxMessageNodes()
```

Reload after changing the limit.

## Browser extension

Recommended if you want a more extension-like install flow.

### Chrome / Edge side-load

1. Open the browser extensions page.
2. Enable developer mode.
3. Choose **Load unpacked**.
4. Select the [`extension/`](../extension) directory.
5. Open a long ChatGPT conversation.
6. Look for the `ConvoGlide` badge in the top-right corner.

### Current extension scope

- ChatGPT Web only
- alpha quality
- store packaging is not part of the current alpha release gate

## Developer setup

### Requirements

- Node.js `22+`
- Google Chrome

### Build generated runtime files

```bash
npm run build
```

### Start a dedicated Chrome test window

```bash
./scripts/launch-test-chrome.sh about:blank
```

### Probe injection

```bash
node scripts/probe-userscript-injection.mjs https://chatgpt.com/
```

### Probe first-load behavior on a long thread

```bash
node scripts/probe-userscript-first-load.mjs "<chat-url>" 80
```

### Run the local benchmark lane

This is the easiest repeatable way to generate a fresh benchmark report for a real long thread.

Before using it, log into ChatGPT once in the dedicated Chrome profile created by `./scripts/launch-test-chrome.sh`.

```bash
npm run benchmark:lane -- "<chat-url>" --keep 80
```

Outputs:

- `artifacts/benchmarks/latest.json`
- `artifacts/benchmarks/latest.md`

### Package alpha assets

```bash
npm run package:alpha
```

Outputs:

- `dist/convoglide.user.js`
- `dist/convoglide-extension.zip`

## How to confirm it is working

- A `ConvoGlide` badge appears near the top-right corner
- The badge phase changes away from `boot`
- `window.ConvoGlide` exists in the page console
- For very long threads, the badge should report `fetch-trim` and later `virtualizer`
