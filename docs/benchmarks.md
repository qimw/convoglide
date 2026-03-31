# Benchmarks

## Public KPI definitions

These are the user-facing benchmark definitions that guide the project now:

- **First-visible time**: when the target thread first becomes visible to the user
- **First-operable time**: when the thread first becomes readable and safely scrollable
- **Standardized 4-screen long-scroll test**: whether the page stays smooth during a fixed long-scroll evaluation
- **Render gap**: the browser-side delay between the main conversation response finishing and the thread first becoming visible

The long-scroll reference distance is `3928 px`, derived from the default logical height of a 14-inch MacBook Pro (`982 px × 4`).

This document tracks the current known benchmark results for ConvoGlide.

## Benchmark thread

Current measurements come from a real very long ChatGPT conversation used during development.

This document intentionally separates:

- **user-facing metrics** that can be explained in plain language
- **engineering diagnostics** that are still useful for runtime work but should not dominate the public headline

Reader-facing facts about the current benchmark thread:

- Original conversation response size: about `5.0 MB`
- Current active branch is extremely long, which is why one thread can already behave like a stress test on its own

Low-level request details such as `conversation/init`, `textdocs`, and raw mapping counts are still tracked for engineering analysis, but they are no longer used as the public headline table.

## Benchmark thread profile

The current benchmark thread is not just "one long chat" in the abstract. It already behaves like a stress test by itself.

| Item | Value | Plain-language reading |
| --- | ---: | --- |
| Main active-branch message nodes | `1757` | The visible branch itself is extremely long |
| Q+A rounds | `368` | One user message followed by one assistant reply counts as one round |
| Average message length | `448` chars | The thread is not only long, it is also content-heavy |
| Average user message length | `113` chars | User prompts are usually short |
| Average assistant message length | `891` chars | Assistant replies are often long and explanation-heavy |
| Original conversation response size | `~5.06 MB` | Opening the thread still starts with a very large response body |
| Role mix | `572 user`, `805 assistant`, `294 system`, `86 tool` | The active branch is not a clean user/assistant-only list; internal nodes are interleaved |

This is why ConvoGlide now treats **user-visible messages** as the primary bootstrap unit instead of counting every raw internal node equally.

## User-facing pilot benchmark

The current public benchmark is still a **2-run pilot**. It is useful for direction-setting, but it is not yet the final public claim. After the current optimization work finishes, the public benchmark will be refreshed with **5 runs**.

Current user-facing questions:

1. When does the target thread first become visible?
2. Once it is open, does a standardized **4-screen long-scroll test** stay smooth?

For documentation, the public long-scroll label uses a **4-screen reference distance** of `3928 px`, based on the default 14-inch MacBook Pro reference height (`982 px × 4`). During the current pilot phase, the automation still caps travel distance by the actual available scroll range of the page.

| Variant | Strategy | First-visible time, median (`n=2`) | Standardized 4-screen long-scroll test | Current reading |
| --- | --- | ---: | --- | --- |
| Raw ChatGPT | none | `14.54 s` | not evaluable in `2/2` pilot runs | The title can appear quickly, but the page often stops cooperating before a clean long-scroll evaluation finishes |
| ConvoGlide | default `keep 8` | `14.35 s` | `smooth` in `2/2` pilot runs | The current pilot is slightly faster on first-visible time and much more reliable once the thread is open |

Current public interpretation:

- **Do** call the current first-visible result a promising pilot signal, not a final speed claim
- **Do** claim a repeatable post-load smoothness win on the current pilot thread

## Engineering iteration table

The table below keeps using `80` for Iteration 2 and 3 because that heavier profile still exercises post-load virtualization more clearly than the new fast default.

| Iteration | Strategy | Payload | Mapping nodes | Virtualized turns | Steady DOM | Heap | Passive soak check | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 0 | Baseline | ~5.0 MB | ~1820 | 0 | hard to keep stable | n/a | degrades before clean comparison is easy | Real long thread becomes heavy once the conversation view fully arrives |
| 1A | Payload trim, keep `120` | ~0.38 MB | 121 | 0 | ~11.8k | ~112 MB | usable in the current passive soak check | Trim-only path |
| 1B | Payload trim, keep `80` | ~0.30 MB | 81 | 0 | ~9.1k | ~99 MB | usable in the current passive soak check | Current stress profile for post-load benchmarking |
| 1C | Payload trim, keep `8` | ~0.07 MB | 9 | 0 | n/a | n/a | usable in the current passive soak check | Current fast-default profile; payload reduction reaches about 98.6% |
| 2 | Payload trim `80` + post-load virtualization MVP | ~0.30 MB | 81 | `33/45` | ~3.8k | ~99 MB | usable in the current passive soak check | DOM drops by about 58% versus 1B; heap is still noisy in this alpha design |
| 3 | Iteration 2 + heavy block lazy activation MVP | ~0.30 MB | 81 | `33/45` | ~3.5k | ~100 MB | usable in the current passive soak check | Deferred `13` heavy blocks; DOM drops by about 9% versus 2 |

## Cold-start bootstrap exploration

A newer exploratory pass tested the first-load bootstrap window directly. These are **single-run exploratory samples**, not public headline benchmark claims. They are useful for tuning because they isolate the first visible slice that the current page receives on an uncached open.

| Variant | Cold-start bootstrap window | First-visible time | Standardized 4-screen long-scroll test | Notes |
| --- | --- | ---: | --- | --- |
| ConvoGlide | bootstrap `4`, cache `keep 8` | `27.180 s` | `smooth` | The runtime hit `fetch-bootstrap` and returned `1842 -> 6` nodes to the current page while caching the normal `keep 8` trim for reopen |
| ConvoGlide | bootstrap `2`, cache `keep 8` | `13.434 s` | `smooth` | The runtime hit `fetch-bootstrap` and returned `1844 -> 3` nodes to the current page while caching the normal `keep 8` trim for reopen |
| ConvoGlide | warm reopen, cache `keep 8` | `14.351 s` | `smooth` | The runtime reused local conversation cache and reported repeated `cache-hit` events |

Current reading:

- the plugin now has a **real cold-start bootstrap path**, not just a theory on paper
- smaller bootstrap windows can materially change first-visible behavior
- `bootstrap = 2` is promising on the current thread, but it still needs repeated runs before it becomes a public default or a headline claim
- warm reopen behavior still benefits from the larger cached `keep 8` slice

## Internal passive soak check

The project still keeps one internal diagnostic that is **not** part of the public headline table:

- a passive `50 s` soak check with no manual interaction

This is useful for maintainers because some very long threads continue to get heavier for a while after the title first appears. It is **not** the best way to explain the project to end users, so it stays here instead of the README headline table.

On the current benchmark thread:

- latest repeated user-facing lane (`2` iterations, `keep 8`) produced `0/2` successful passive-soak runs for plain ChatGPT
- the same lane produced `2/2` successful passive-soak runs for ConvoGlide
- raw ChatGPT also failed the long-scroll evaluation in `2/2` pilot runs
- ConvoGlide returned `smooth` in `2/2` pilot runs at `keep 8`
- separate clean reruns at `keep 80` also returned `smooth`

## Latest engineering timeline

These checkpoints come from a recent local `npm run benchmark:lane -- "<chat-url>" --keep 80` run against the current benchmark thread.

| Sample | Title | Phase | DOM nodes | Virtualized turns | Heap | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `1000ms` | `ChatGPT` | `userscript` | 591 | 0 | ~98 MB | The script is already injected before the long thread resolves |
| `8000ms` | `生活 - 酒精反应就医` | `fetch-trim` | 1165 | 0 | ~104 MB | Payload rewrite confirms `1820 -> 81` active nodes |
| `12000ms` | `生活 - 酒精反应就医` | `fetch-trim` | 1165 | `0` | ~105 MB | Payload rewrite completes before turn-level optimizations take over |
| `18000ms` | `生活 - 酒精反应就医` | `lazy-heavy` | 3471 | `33/45` | ~118 MB | Heavy block deferral and turn virtualization are both active |
| `35000ms` | `生活 - 酒精反应就医` | `lazy-heavy` | 3471 | `33/45` | ~97 MB | Heap stabilizes after initial restore pressure |
| `50000ms` | `生活 - 酒精反应就医` | `lazy-heavy` | 3471 | `33/45` | ~97 MB | Current steady-state engineering snapshot |

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

## Latest rerun check

A follow-up rerun on `2026-03-29` after the restore-interaction and runtime-tuning changes kept the same steady-state shape as the earlier public alpha sample while improving the latest rerun slightly:

- steady DOM moved from `3473` to `3471`
- max virtualized turns remained at `33`
- heavy placeholders remained at `13`
- steady heap moved from about `103 MB` to about `98 MB`

That rerun suggests the restore UX work and the latest runtime tuning did not regress steady DOM behavior on the current benchmark thread, while still leaving the same restore-snapshot tradeoff in place.

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

The comparison tool now also includes:

- scroll verdict
- scroll distance
- scroll average frame time

For public writing, use these definitions:

- **First-visible time**: the first sample where the page title resolves to the target thread title
- **Standardized 4-screen long-scroll test**: the public label for the programmatic long-scroll probe, documented against the `3928 px` 14-inch MacBook Pro reference distance and capped by the page's actual available scroll range
- **Passive soak check**: an internal maintainers-only diagnostic that observes whether the thread keeps cooperating at `50 s` without manual interaction

All headline results shown in the README should be derived from this document.
