# Releasing

This project currently treats GitHub releases as alpha distribution points for:

- `dist/convoglide.user.js`
- `dist/convoglide-extension.zip`

## Pre-release checklist

1. Start from a clean `main` branch.
2. Run:

```bash
npm test
npm run build
npm run check:docs
npm run package:alpha
npm run verify:package
```

3. If you touched runtime behavior, generate or compare a fresh benchmark report:

```bash
npm run benchmark:lane -- "<chat-url>" --keep 20
npm run benchmark:lane -- "<chat-url>" --keep 80
```

Use the `20` run for the public default path and the `80` run when the release claim depends on post-load virtualization behavior.

4. Review:

- `README.md`
- `README.zh-CN.md`
- `docs/benchmarks.md`
- `CHANGELOG.md`

## Tagging

The current workflow publishes release assets for any Git tag that starts with `v`.

Suggested alpha tags:

- `v0.1.0-alpha.1`
- `v0.1.0-alpha.2`

Create and push a tag:

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

## What the release workflow does

The `Release Assets` workflow:

1. runs tests
2. rebuilds packaged alpha assets
3. publishes:
   - `dist/convoglide.user.js`
   - `dist/convoglide-extension.zip`

## Post-release checks

After the workflow finishes, verify:

- the GitHub release exists
- both alpha assets are attached
- the userscript file downloads correctly
- the extension zip opens and contains:
  - `manifest.json`
  - `content.css`
  - `content.js`
  - `page-hook.js`
- the release notes do not contain obviously stale benchmark claims

## What not to do

- Do not cut a release if the packaged assets fail local verification.
- Do not change the benchmark summary without updating `docs/benchmarks.md`.
- Do not publish a new tag only to fix README wording; batch small docs-only fixes when possible.
