[English](README.md) | [简体中文](README.zh-CN.md)

# ConvoGlide

[![CI](https://github.com/qimw/convoglide/actions/workflows/ci.yml/badge.svg)](https://github.com/qimw/convoglide/actions/workflows/ci.yml)

**Make long AI chats feel fast again.**

ConvoGlide is an experimental open source project for reducing lag in long AI web conversations. The current public alpha is intentionally focused on **ChatGPT Web** so the runtime, benchmark method, install flow, and release process can all become stable together.

`Experimental` `ChatGPT-first` `Local-only` `MIT`

## Quick Install

- Userscript: [install directly](https://raw.githubusercontent.com/qimw/convoglide/main/userscript/convoglide.user.js) or see [docs/install.md#userscript](docs/install.md#userscript)
- Browser extension: download the latest [GitHub release assets](https://github.com/qimw/convoglide/releases) or load [`extension/`](extension); more in [docs/install.md#browser-extension](docs/install.md#browser-extension)
- Developer setup: see [docs/install.md#developer-setup](docs/install.md#developer-setup)

## What It Fixes

ConvoGlide targets two different bottlenecks:

- **Slow first load**
  - very long ChatGPT conversations can ship a huge conversation payload before the page becomes interactive
  - the current alpha already trims that payload, but repeatable wall-clock first-visible wins are still under active tuning
- **Slow after load**
  - after the thread opens, scrolling, typing, and interaction can degrade as too much history stays rendered

![ConvoGlide runtime flow](docs/assets/runtime-flow.svg)

## Performance Snapshot

Measurements below come from a real very long ChatGPT conversation used as the current benchmark thread.

Plain-language check on that same thread:

- In the latest repeated user-facing lane (`2` plain runs vs `2` optimized runs), raw ChatGPT reached a stable `50 s` sample in `0/2` runs
- The same lane reached a stable `50 s` sample in `2/2` runs with ConvoGlide `keep 20`
- Raw ChatGPT also failed the synthetic long-scroll probe in `2/2` runs, while ConvoGlide reported `smooth` scrolling in `2/2` runs
- Wall-clock title timing still moves around too much to claim a repeatable first-visible speed win yet, so the current public alpha should be understood as a stability and smoothness win first

| Iteration | Strategy | Payload | Mapping nodes | Steady DOM | Heap | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 0 | Baseline | ~5.0 MB | ~1820 | Hard to probe | n/a | Real thread becomes difficult to inspect once fully loaded |
| 1A | Payload trim, keep `120` | ~0.38 MB | 121 | ~11.8k | ~112 MB | Page stays probeable through 50s |
| 1B | Payload trim, keep `80` | ~0.30 MB | 81 | ~9.1k | ~99 MB | Recommended stress profile for post-load benchmarking |
| 2 | Trim `80` + post-load virtualization MVP | ~0.30 MB | 81 | ~3.8k | ~99 MB | Virtualized `33/45` rendered turns; DOM drops ~58% vs 1B |
| 3 | Iteration 2 + heavy block lazy activation MVP | ~0.30 MB | 81 | ~3.5k | ~100 MB | Deferred `13` heavy blocks; DOM drops ~9% vs 2 |

More detail: [docs/benchmarks.md](docs/benchmarks.md)

## TODO / Roadmap

- [x] Pre-hydration payload trimming for long ChatGPT conversations
- [x] Hard rename from prototype naming to ConvoGlide
- [x] Public runtime API cleanup with `window.ConvoGlide`
- [x] Userscript alpha install path
- [x] One-click userscript install URL
- [x] Chrome / Edge side-load extension path
- [x] Public benchmark summary for Iteration 0 and Iteration 1
- [x] First public post-load virtualization benchmark snapshot
- [x] Local automated benchmark lane
- [x] Packaged extension zip build script
- [x] Heavy block lazy activation MVP for large code blocks and tables
- [x] Click and keyboard restore for virtualized turns and heavy blocks
- [x] Release checklist doc
- [x] Browser store readiness checklist
- [x] Docs consistency validation
- [ ] Post-load virtualization tuning
- [ ] Wider lazy activation tuning for images, media, and memory behavior
- [ ] First real tagged alpha release verification
- [ ] More visual installation and benchmark materials

Expanded roadmap: [docs/roadmap.md](docs/roadmap.md)

## How It Works

### Optimization 1: Fix slow first load

ConvoGlide intercepts oversized ChatGPT conversation payloads before the app hydrates and trims the active branch down to the most recent message nodes. This keeps the first render from paying the full cost of an extremely large conversation tree.

The current public default is `keep 20`, because that profile has been the best fit so far for getting long threads on-screen faster for normal users. Higher keep values such as `80` and `120` are still available when you want to keep more recent history visible.

### Optimization 2: Fix slow after load

ConvoGlide also includes a post-load virtualization MVP. It keeps the most relevant visible turns active and replaces far off-screen turns with lightweight placeholders. This is meant to reduce scroll and input jank after the thread is already open.

### Optimization 3: Defer heavy blocks after load

ConvoGlide now also defers large off-screen `pre` and `table` blocks inside still-active turns, and it applies lazy-loading hints to media. This trims another layer of rendering pressure after turn-level virtualization has already done its work.

### Next optimization work

The latest benchmark shows that heavy block deferral lowers steady DOM again, but heap behavior is still noisier than DOM reduction because the alpha keeps detached snapshots around for fast restore. The next step is tuning those restore paths and broadening media-specific optimizations.

Architecture detail: [docs/architecture.md](docs/architecture.md)

## Project Layout

- `src/runtime/`
  - source of truth for the shared ChatGPT runtime core
- `userscript/`
  - userscript build output for alpha users
- `extension/`
  - browser extension alpha files for Chrome / Edge side-load
- `scripts/`
  - benchmark, probe, and build helpers
- `docs/`
  - install, benchmark, architecture, roadmap, and FAQ docs
- `docs/assets/`
  - lightweight diagrams for the public docs and README

## Docs

- Install: [docs/install.md](docs/install.md)
- Benchmarks: [docs/benchmarks.md](docs/benchmarks.md)
- Benchmark workflow: [docs/benchmark-workflow.md](docs/benchmark-workflow.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Roadmap: [docs/roadmap.md](docs/roadmap.md)
- FAQ: [docs/faq.md](docs/faq.md)
- Releasing: [docs/releasing.md](docs/releasing.md)
- Store readiness: [docs/store-readiness.md](docs/store-readiness.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security: [SECURITY.md](SECURITY.md)
- Alpha asset packaging: `npm run package:alpha`

## FAQ

Quick answers:

- Does ConvoGlide upload my conversations?
  - No. The current alpha runs locally in the browser and does not send your chat content anywhere.
- Does it delete data from ChatGPT?
  - No. The current optimization changes browser-side rendering behavior and response handling, not your server-side conversation history.
- Is it production-ready?
  - Not yet. It is an experimental alpha focused on proving measurable performance gains.

Full FAQ: [docs/faq.md](docs/faq.md)

## News / Updates

- `2026-03-29`: Renamed the runtime, scripts, and public API from the prototype name to `ConvoGlide`
- `2026-03-29`: Published the first public benchmark snapshot for the real long-thread baseline and payload-trim iterations
- `2026-03-29`: Added the first post-load virtualization MVP to the shared ChatGPT runtime core
- `2026-03-29`: Added one-click userscript install and published the first public virtualization benchmark snapshot
- `2026-03-29`: Added a basic CI workflow to validate generated artifacts, syntax, and naming cleanliness
- `2026-03-29`: Added a local benchmark lane and alpha asset packaging workflow for maintainers
- `2026-03-29`: Added heavy block lazy activation for large off-screen code blocks and tables
- `2026-03-29`: Added benchmark history capture and a report comparison tool for iteration-to-iteration reviews
- `2026-03-29`: Added tagged GitHub release asset publishing for the userscript and extension zip
- `2026-03-29`: Added restore interactions for virtualized turns and heavy blocks, plus docs and CI checks for release packaging
- `2026-03-29`: Tuned post-load runtime scanning and hardened the benchmark lane so empty captures retry instead of being saved as false-success reports
- `2026-03-30`: Switched the public default keep limit to `20` to bias the alpha toward the smallest payload and the most stable first-open behavior on very long threads

## License

[MIT](LICENSE)

## Experiment Note

ConvoGlide is a pure **vibecoding** experimental project built with **Codex in the ChatGPT Plus plan**.
