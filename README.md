# MilkGPT

MilkGPT is a local prototype for improving ChatGPT web performance on very long conversations.

Current focus:
- Trim oversized conversation payloads before the app hydrates
- Expose a visible on-page badge so injection is easy to verify
- Keep a small set of CDP-based scripts for repeatable testing on a real logged-in Chrome session
- Prefer a userscript workflow for real testing because stock Google Chrome ignores the CLI flag used for unpacked-extension isolation

## Layout

- `extension/`: unpacked Chrome extension prototype
- `scripts/`: test and measurement scripts for Chrome remote debugging
- `userscript/`: preferred runtime prototype
- `docs/`: notes and findings

## Recommended Runtime

Use the userscript in `userscript/milkgpt.user.js`.

Recommended default:
- Keep the latest `80` message nodes on the active branch

Optional runtime tuning from the page console:

```js
window.MilkGPT.setMaxMessageNodes(120)
window.MilkGPT.clearMaxMessageNodes()
```

Reload after changing the limit.

## Load The Extension

1. Open Chrome with a dedicated profile and remote debugging enabled.
2. Load `milkgpt/extension/` as an unpacked extension.
3. Open a long ChatGPT conversation.
4. Look for the `MilkGPT` badge in the top-right corner.

## Test Scripts

These scripts expect Chrome remote debugging on `127.0.0.1:9223`.

- `./scripts/launch-test-chrome.sh`
- `npm run analyze:body`
- `npm run analyze:followup`
- `npm run estimate:trim`
- `npm run probe:first-load`
- `npm run probe:injection`
