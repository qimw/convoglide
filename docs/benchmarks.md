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
| 2 | Payload trim `80` + post-load virtualization MVP | ~0.30 MB | 81 | `33/45` | ~3.8k | ~102 MB | stable through 50s | DOM drops by about 58% versus 1B; heap is still noisy in this alpha design |

## Latest Iteration 2 sample timeline

These checkpoints come from the latest `probe-userscript-first-load.mjs` run against the current benchmark thread with keep `80`.

| Sample | Title | Phase | DOM nodes | Virtualized turns | Heap | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- |
| ~3.1s | `ChatGPT` | `userscript` | 389 | 0 | ~22 MB | Script is installed before the thread title resolves |
| ~10.1s | `ChatGPT` | `userscript` | 1061 | 0 | ~59 MB | Shell is up but the long conversation is not fully in yet |
| ~14.1s | `生活 - 酒精反应就医` | `fetch-pass` | 1165 | 0 | ~76 MB | Trimmed payload is already within the current keep window |
| ~20.1s | `生活 - 酒精反应就医` | `virtualizer` | 3811 | `33/45` | ~124 MB | Virtualization is fully active by the time the thread settles |
| ~27.1s | `生活 - 酒精反应就医` | `virtualizer` | 3811 | `33/45` | ~125 MB | First steady-state checkpoint |
| ~37.1s | `生活 - 酒精反应就医` | `virtualizer` | 3811 | `33/45` | ~102 MB | DOM remains stable while heap settles down |
| ~52.1s | `生活 - 酒精反应就医` | `virtualizer` | 3811 | `33/45` | ~102 MB | Current steady-state public alpha snapshot |

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

## Measurement method

Current measurements rely on the Chrome remote-debugging scripts in [`scripts/`](../scripts):

- `scripts/probe-userscript-injection.mjs`
- `scripts/probe-userscript-first-load.mjs`
- `scripts/analyze-conversation-body.mjs`
- `scripts/analyze-followup-payloads.mjs`
- `scripts/estimate-trim-impact.mjs`

All headline results shown in the README should be derived from this document.
