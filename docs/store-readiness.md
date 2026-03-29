# Browser Store Readiness

ConvoGlide does not treat browser-store publication as part of the current alpha gate, but the project should stay close to store-ready.

## Current strengths

- Manifest V3
- No extra extension permissions
- ChatGPT-only match patterns
- Small file surface
- Local-only positioning in docs

## Remaining blockers

- No store listing copy tuned for Chrome Web Store or Edge Add-ons yet
- No icon set prepared for store upload
- No screenshots or short demo visuals prepared
- No dedicated privacy summary page beyond README and FAQ
- No store submission checklist verified end-to-end

## Store-ready checklist

- [ ] Finalize product copy for store listings
- [ ] Prepare icon assets in required sizes
- [ ] Prepare 2 to 4 screenshots or short GIFs
- [ ] Add a short privacy statement page
- [ ] Re-check match patterns and content-script scope
- [ ] Re-check release zip contents against the store package
- [ ] Confirm there are no hidden dev-only diagnostics in the shipped extension
- [ ] Verify install instructions against the latest packaged zip

## Scope guardrails

Before store submission, re-check:

- the extension still only targets ChatGPT Web
- the manifest still avoids unnecessary permissions
- the README benchmark claims still match the latest published benchmark docs

## Recommendation

Treat store readiness as a follow-up after the current alpha runtime tuning settles down. The side-load path is the right default while the benchmark story and packaged assets are still moving quickly.
