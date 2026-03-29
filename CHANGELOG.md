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
- Basic CI validation for generated artifacts, syntax, and naming cleanliness
- Local automated benchmark lane for real long-thread regression runs
- Alpha asset packaging for `dist/convoglide.user.js` and `dist/convoglide-extension.zip`

### Changed

- Hard-renamed the project from the prototype naming to `ConvoGlide`
- Replaced the public runtime API with `window.ConvoGlide`
- Added the first post-load virtualization MVP to the shared runtime
