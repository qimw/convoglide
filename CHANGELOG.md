# Changelog

## 0.1.0-alpha

### Added

- ConvoGlide userscript alpha path
- One-click userscript install URL
- ConvoGlide browser extension alpha path
- Shared ChatGPT runtime core
- Initial OSS docs set: install, benchmarks, architecture, roadmap, and FAQ
- Public benchmark snapshot for the real long-thread baseline and payload-trim iterations
- First public benchmark snapshot for post-load virtualization
- First public benchmark snapshot for heavy block lazy activation
- Basic CI validation for generated artifacts, syntax, and naming cleanliness
- Local automated benchmark lane for real long-thread regression runs
- Benchmark history capture and report comparison tooling
- Alpha asset packaging for `dist/convoglide.user.js` and `dist/convoglide-extension.zip`
- Tagged GitHub release asset workflow

### Changed

- Hard-renamed the project from the prototype naming to `ConvoGlide`
- Replaced the public runtime API with `window.ConvoGlide`
- Added the first post-load virtualization MVP to the shared runtime
- Added heavy block lazy activation for large off-screen code blocks and tables
- Added click and keyboard restore for virtualized turns and deferred heavy blocks
- Added release, store readiness, and docs validation support for the public alpha
- Added a benchmark workflow guide and stricter benchmark-lane retry/validation behavior
- Tuned post-load runtime scanning to skip hidden-document work and cache heavy-block classification
- Switched the public default keep limit from `80` to `20` after the latest clean rerun showed a shorter post-response render gap and much better long-thread stability
- Added synthetic long-scroll verdicts and frame-time summaries to the probe and benchmark comparison tools
