[English](README.md) | [简体中文](README.zh-CN.md)

# ConvoGlide

**Make long AI chats feel fast again.**

ConvoGlide is an experimental open source project for reducing lag in long AI web conversations. The current public alpha focuses on **ChatGPT Web** first, with the architecture intentionally shaped so we can extend it to **Gemini**, **Claude**, and other long-thread chat apps later.

`Experimental` `ChatGPT-first` `Local-only` `MIT`

## Quick Install

- Userscript: [install directly](https://raw.githubusercontent.com/qimw/convoglide/main/userscript/convoglide.user.js) or see [docs/install.md#userscript](docs/install.md#userscript)
- Browser extension: load [`extension/`](extension) or see [docs/install.md#browser-extension](docs/install.md#browser-extension)
- Developer setup: see [docs/install.md#developer-setup](docs/install.md#developer-setup)

## What It Fixes

ConvoGlide targets two different bottlenecks:

- **Slow first load**
  - very long ChatGPT conversations can ship a huge conversation payload before the page becomes interactive
- **Slow after load**
  - after the thread opens, scrolling, typing, and interaction can degrade as too much history stays rendered

## Performance Snapshot

Measurements below come from a real very long ChatGPT conversation used as the current benchmark thread.

| Iteration | Strategy | Payload | Mapping nodes | Steady DOM | Heap | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 0 | Baseline | ~5.0 MB | ~1820 | Hard to probe | n/a | Real thread becomes difficult to inspect once fully loaded |
| 1A | Payload trim, keep `120` | ~0.38 MB | 121 | ~11.8k | ~112 MB | Page stays probeable through 50s |
| 1B | Payload trim, keep `80` | ~0.30 MB | 81 | ~9.1k | ~99 MB | Current recommended default |
| 2 | Trim `80` + post-load virtualization MVP | ~0.30 MB | 81 | ~3.8k | ~99 MB | Virtualized `33/45` rendered turns; DOM drops ~58% vs 1B |
| 3 | Iteration 2 + heavy block lazy activation MVP | ~0.30 MB | 81 | ~3.5k | ~97 MB | Deferred `13` heavy blocks; DOM drops ~9% vs 2 |

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
- [ ] Post-load virtualization tuning
- [ ] Wider lazy activation tuning for images, media, and memory behavior
- [ ] Gemini adapter prototype
- [ ] Claude adapter research

Expanded roadmap: [docs/roadmap.md](docs/roadmap.md)

## How It Works

### Optimization 1: Fix slow first load

ConvoGlide intercepts oversized ChatGPT conversation payloads before the app hydrates and trims the active branch down to the most recent message nodes. This keeps the first render from paying the full cost of an extremely large conversation tree.

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

## Docs

- Install: [docs/install.md](docs/install.md)
- Benchmarks: [docs/benchmarks.md](docs/benchmarks.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Roadmap: [docs/roadmap.md](docs/roadmap.md)
- FAQ: [docs/faq.md](docs/faq.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
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

## License

[MIT](LICENSE)

## Experiment Note

ConvoGlide is a pure **vibecoding** experimental project built with **Codex in the ChatGPT Plus plan**.
