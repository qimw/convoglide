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

The default active-branch limit is `20` message nodes.

That default is intentionally biased toward faster first-open behavior on very long threads.

If you want to keep more recent history visible, try:

- `80` for the current post-load stress profile
- `120` when you want even more recent history visible and are willing to trade away speed

From the page console:

```js
window.ConvoGlide.setMaxMessageNodes(80)
window.ConvoGlide.setMaxMessageNodes(120)
window.ConvoGlide.clearMaxMessageNodes()
```

Reload after changing the limit.

## Browser extension

Recommended if you want a more extension-like install flow.

### From the latest GitHub release

1. Open the [GitHub releases page](https://github.com/qimw/convoglide/releases).
2. Download `convoglide-extension.zip` from the latest alpha release.
3. Unzip it somewhere local.
4. Follow the Chrome / Edge side-load steps below with the unzipped folder.

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

### Release assets for non-technical users

If you do not want to clone this repository, the alpha release page is the simplest download point:

- `convoglide.user.js`
- `convoglide-extension.zip`

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
node scripts/probe-userscript-first-load.mjs "<chat-url>" 20
```

### Run the local benchmark lane

This is the easiest repeatable way to generate a fresh benchmark report for a real long thread.

Before using it, log into ChatGPT once in the dedicated Chrome profile created by `./scripts/launch-test-chrome.sh`.

For the fastest user-facing default check, use `20`.
For the heavier post-load virtualization stress profile used in the public Iteration 2 and 3 tables, use `80`.

```bash
npm run benchmark:lane -- "<chat-url>" --keep 20
npm run benchmark:lane -- "<chat-url>" --keep 80
```

Outputs:

- `artifacts/benchmarks/latest.json`
- `artifacts/benchmarks/latest.md`
- `artifacts/benchmarks/history/<timestamp>.json`
- `artifacts/benchmarks/history/<timestamp>.md`

### Run the repeated user-facing lane

This is the easiest way to answer the human question of:

- how long until the title appears
- whether the page stays stable
- whether long scrolling still feels smooth

```bash
npm run benchmark:user-facing -- "<chat-url>" --iterations 2 --keep 20
```

### Compare two benchmark reports

```bash
npm run benchmark:compare -- \
  artifacts/benchmarks/history/<base>.json \
  artifacts/benchmarks/history/<head>.json
```

### Package alpha assets

```bash
npm run package:alpha
npm run verify:package
```

Outputs:

- `dist/convoglide.user.js`
- `dist/convoglide-extension.zip`

## How to confirm it is working

- A `ConvoGlide` badge appears near the top-right corner
- The badge phase changes away from `boot`
- `window.ConvoGlide` exists in the page console
- For very long threads, the badge should report `fetch-trim` and later `virtualizer`
