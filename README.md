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

![ConvoGlide install paths](docs/assets/install-paths.svg)

## What It Fixes

ConvoGlide targets two different bottlenecks:

- **Slow first load**
  - very long ChatGPT conversations can ship a huge conversation payload before the page becomes interactive
  - the current alpha already trims that payload and now shows a small pilot first-visible win on the benchmark thread
- **Slow after load**
  - after the thread opens, scrolling, typing, and interaction can degrade as too much history stays rendered

![ConvoGlide runtime flow](docs/assets/runtime-flow.svg)

## Performance Snapshot

Measurements below come from a real very long ChatGPT conversation used as the current benchmark thread.

Current public headline numbers are still a **2-run pilot benchmark**. Final public claims will be refreshed with `n=5` after the current optimization work finishes.

The user-facing pilot currently answers two questions:

- when does the target thread first become visible
- does a standardized **4-screen long-scroll test** stay smooth once the thread is open

Current pilot reading on the benchmark thread:

- raw ChatGPT median first-visible time: `14.54 s`
- ConvoGlide default `keep 8` median first-visible time: `14.35 s`
- raw ChatGPT did **not** complete the long-scroll evaluation cleanly in `2/2` pilot runs
- ConvoGlide reported `smooth` in `2/2` pilot runs
- the clearer repeatable public win is still post-load smoothness, but the current pilot now also shows a small first-visible edge

![ConvoGlide user-facing lane snapshot](docs/assets/user-facing-lane.svg)

| Variant | Strategy | First-visible time, median (`n=2`) | Standardized 4-screen long-scroll test | Current reading |
| --- | --- | ---: | --- | --- |
| Raw ChatGPT | none | `14.54 s` | not evaluable in `2/2` pilot runs | The title can appear quickly, but the page still fails to stay cooperative for a clean long-scroll evaluation |
| ConvoGlide | default `keep 8` | `14.35 s` | `smooth` in `2/2` pilot runs | The current pilot is slightly faster on first-visible time and much more reliable once the thread is open |

The public long-scroll label is based on a **4-screen reference distance**. For documentation, that means `3928 px`, derived from the default 14-inch MacBook Pro reference height (`982 px`). The current pilot automation still caps the travel distance by the actual available scroll range of the page.

### Engineering Iteration Snapshot

| Iteration | Strategy | Payload | Steady DOM | Heap | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| 0 | Baseline | ~5.0 MB | Hard to probe | n/a | Real thread becomes difficult to inspect once fully loaded |
| 1A | Payload trim, keep `120` | ~0.38 MB | ~11.8k | ~112 MB | Trim-only path |
| 1B | Payload trim, keep `80` | ~0.30 MB | ~9.1k | ~99 MB | Stress profile for post-load benchmarking |
| 1C | Payload trim, keep `8` | ~0.07 MB | n/a | n/a | Current fast-default profile; payload reduction reaches ~98.6% |
| 2 | Trim `80` + post-load virtualization MVP | ~0.30 MB | ~3.8k | ~99 MB | Virtualized `33/45` rendered turns; DOM drops ~58% vs 1B |
| 3 | Iteration 2 + heavy block lazy activation MVP | ~0.30 MB | ~3.5k | ~100 MB | Deferred `13` heavy blocks; DOM drops ~9% vs 2 |

More detail: [docs/benchmarks.md](docs/benchmarks.md)

## Optimization Targets

These are the current working targets for the next public benchmark refresh:

- final public benchmark uses **5 runs**
- cold-start **first-visible time** should hold at **`<= 15 s`**
- cold-start **first-operable time** should move toward **`<= 16 s`**
- warm-reopen **first-visible time** should move toward **`<= 6 s`**
- the standardized **4-screen long-scroll test** should report **`smooth` in `5/5` runs**
- steady DOM on the default profile should move toward **`<= 3.0k`**
- steady heap on the default profile should move toward **`<= 90 MB`**
- render gap should move toward **`<= 1.5 s`**

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
- [x] First real tagged alpha release verification
- [x] More visual installation and benchmark materials

Expanded roadmap: [docs/roadmap.md](docs/roadmap.md)

## How It Works

### Optimization 1: Fix slow first load

ConvoGlide intercepts oversized ChatGPT conversation payloads before the app hydrates and trims the active branch down to the most recent message nodes. This keeps the first render from paying the full cost of an extremely large conversation tree.

The current public default is `keep 8`, because that profile is the first one that has pushed the benchmark thread below `15 s` in the current pilot while still keeping post-load long-scroll behavior smooth. Higher keep values such as `80` and `120` are still available when you want to keep more recent history visible.

### Optimization 2: Fix slow after load

ConvoGlide also includes a post-load virtualization MVP. It keeps the most relevant visible turns active and replaces far off-screen turns with lightweight placeholders. This is meant to reduce scroll and input jank after the thread is already open.

### Optimization 3: Defer heavy blocks after load

ConvoGlide now also defers large off-screen `pre` and `table` blocks inside still-active turns, and it applies lazy-loading hints to media. This trims another layer of rendering pressure after turn-level virtualization has already done its work.

### Next optimization work

The latest benchmark shows that heavy block deferral lowers steady DOM again, but heap behavior is still noisier than DOM reduction because the alpha keeps detached snapshots around for fast restore. The next step is tuning those restore paths and broadening media-specific optimizations.

Architecture detail: [docs/architecture.md](docs/architecture.md)

The architecture doc now explicitly separates what a plugin can realistically optimize from what only the upstream product can change. ConvoGlide is designed as a plugin-side progressive rendering layer, not a server-side pagination system.

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
- `2026-03-30`: Switched the public default keep limit to `8`, delayed post-load fallback work to `30 s`, and made the on-page debug badge opt-in so the default first-load path stays lighter
- `2026-03-30`: Reached a `14.35 s` median first-visible time on the benchmark thread in the current `n=2` pilot while preserving `smooth` long-scroll results in `2/2` runs
- `2026-03-30`: Verified the first real tagged alpha release (`v0.1.0-alpha.1`) and confirmed both release assets download correctly

## License

[MIT](LICENSE)

## Experiment Note

ConvoGlide is a pure **vibecoding** experimental project built with **Codex in the ChatGPT Plus plan**.
