# Benchmarks

This document tracks the current known benchmark results for ConvoGlide.

## Benchmark thread

Current measurements come from a real very long ChatGPT conversation used during development.

Important observed facts from that thread:

- Original conversation response size: about `5.0 MB`
- Mapping nodes: about `1820`
- Main branch nodes: about `1749`
- `conversation/init` response: about `654 bytes`
- `conversation/<id>/textdocs`: effectively empty at `[]`

## Iteration table

| Iteration | Strategy | Payload | Mapping nodes | Virtualized turns | Steady DOM | Heap | Probeability | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 0 | Baseline | ~5.0 MB | ~1820 | 0 | hard to keep stable | n/a | degrades | Real long thread becomes heavy once the conversation view fully arrives |
| 1A | Payload trim, keep `120` | ~0.38 MB | 121 | 0 | ~11.8k | ~112 MB | stable through 50s | Trim-only path |
| 1B | Payload trim, keep `80` | ~0.30 MB | 81 | 0 | ~9.1k | ~99 MB | stable through 50s | Current recommended default |
| 2 | Payload trim `80` + post-load virtualization MVP | ~0.30 MB | 81 | `33/45` | ~3.8k | ~99 MB | stable through 50s | DOM drops by about 58% versus 1B; heap is still noisy in this alpha design |
| 3 | Iteration 2 + heavy block lazy activation MVP | ~0.30 MB | 81 | `33/45` | ~3.5k | ~100 MB | stable through 50s | Deferred `13` heavy blocks; DOM drops by about 9% versus 2 |

## Latest Iteration 2 sample timeline

These checkpoints come from a recent local `npm run benchmark:lane -- "<chat-url>" --keep 80` run against the current benchmark thread.

| Sample | Title | Phase | DOM nodes | Virtualized turns | Heap | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `1000ms` | `ChatGPT` | `userscript` | 591 | 0 | ~98 MB | The script is already injected before the long thread resolves |
| `8000ms` | `生活 - 酒精反应就医` | `fetch-trim` | 1165 | 0 | ~104 MB | Payload rewrite confirms `1820 -> 81` active nodes |
| `12000ms` | `生活 - 酒精反应就医` | `fetch-trim` | 1165 | `0` | ~105 MB | Payload rewrite completes before turn-level optimizations take over |
| `18000ms` | `生活 - 酒精反应就医` | `lazy-heavy` | 3471 | `33/45` | ~118 MB | Heavy block deferral and turn virtualization are both active |
| `35000ms` | `生活 - 酒精反应就医` | `lazy-heavy` | 3471 | `33/45` | ~97 MB | Heap stabilizes after initial restore pressure |
| `50000ms` | `生活 - 酒精反应就医` | `lazy-heavy` | 3471 | `33/45` | ~97 MB | Current steady-state public alpha snapshot |

## Interpretation

### What Iteration 1 proves

Iteration 1 shows that the first major bottleneck is the oversized payload itself. Even before later DOM cost and scroll cost dominate, the page already pays too much just to receive and hydrate the conversation tree.

### What Iteration 2 now shows

Iteration 2 focuses on the second bottleneck:

- scrolling cost
- input lag
- off-screen render pressure after the page is already open

The first public Iteration 2 run now shows a clear DOM win:

- steady DOM drops from about `9.1k` to about `3.8k`
- the runtime virtualized `33` out of `45` rendered turns at steady state

The same run also shows an important current tradeoff:

- heap did **not** drop as dramatically as DOM
- the current alpha keeps detached turn snapshots so it can restore off-screen content quickly

That is why the next virtualization work is about tuning and memory behavior, not just proving the concept.

### What Iteration 3 now shows

Iteration 3 adds one more layer after turn-level virtualization:

- off-screen heavy `pre` blocks
- off-screen heavy `table` blocks
- media hinting for images, iframes, and videos

On the current benchmark thread, this pass deferred `13` heavy blocks and lowered steady DOM again from about `3.8k` to about `3.5k`.

The tradeoff is similar to Iteration 2:

- DOM pressure drops faster than heap pressure
- restore-friendly snapshots are still part of the design

## Measurement method

Current measurements rely on the Chrome remote-debugging scripts in [`scripts/`](../scripts):

- `scripts/probe-userscript-injection.mjs`
- `scripts/probe-userscript-first-load.mjs`
- `scripts/run-benchmark-lane.mjs`
- `scripts/compare-benchmark-reports.mjs`
- `scripts/analyze-conversation-body.mjs`
- `scripts/analyze-followup-payloads.mjs`
- `scripts/estimate-trim-impact.mjs`

The benchmark lane writes:

- `artifacts/benchmarks/latest.json`
- `artifacts/benchmarks/latest.md`
- `artifacts/benchmarks/history/<timestamp>.json`
- `artifacts/benchmarks/history/<timestamp>.md`

Use `npm run benchmark:compare -- <base.json> <head.json>` to compare two saved reports.

All headline results shown in the README should be derived from this document.
