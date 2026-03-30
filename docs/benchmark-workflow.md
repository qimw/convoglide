# Benchmark Workflow

This document explains the local benchmark loop used for the current ConvoGlide alpha.

## What it is for

Use the benchmark lane when you want to:

- confirm that a runtime change did not regress the current long-thread baseline
- compare one iteration against another
- refresh the public benchmark numbers before updating the README

## Before you start

1. Build the latest runtime:

```bash
npm run build
```

2. Launch the dedicated Chrome profile:

```bash
./scripts/launch-test-chrome.sh about:blank
```

3. Log into ChatGPT once in that dedicated browser window.

## Run the lane

Use the current benchmark thread and keep limit.

For the normal user-facing default check:

```bash
npm run benchmark:lane -- "<chat-url>" --keep 20
```

For the heavier stress profile used to exercise post-load virtualization more clearly:

```bash
npm run benchmark:lane -- "<chat-url>" --keep 80
```

Outputs:

- `artifacts/benchmarks/latest.json`
- `artifacts/benchmarks/latest.md`
- `artifacts/benchmarks/history/<timestamp>.json`
- `artifacts/benchmarks/history/<timestamp>.md`

The lane now retries first-load capture automatically when navigation succeeds but no usable samples are collected.

Each saved JSON report also includes:

- `firstResolvedTitleSample`
- `stableSample`
- `firstVirtualizerSample`
- `scrollVerdict`
- `scrollMetrics`

Those fields are the easiest way to explain results in plain language, for example:

- when the target conversation title first appeared
- when the optimized page reached a stable state
- whether a synthetic long scroll stayed smooth or became janky

## Compare two saved runs

```bash
npm run benchmark:compare -- \
  artifacts/benchmarks/history/<base>.json \
  artifacts/benchmarks/history/<head>.json
```

That produces a JSON summary and a Markdown table showing:

- first title time
- main conversation response time
- render gap after the main response
- DOM delta
- heap delta
- virtualized turn delta
- heavy placeholder delta
- scroll verdict
- scroll distance
- scroll average frame time

## How to use the result

When a runtime change is meant to improve performance:

1. run the lane
2. compare it against the previous saved run
3. update:
   - `README.md`
   - `README.zh-CN.md`
   - `docs/benchmarks.md`
   - `CHANGELOG.md`

Only claim an optimization win after the new run and comparison support it.

If the lane still fails after retries, treat that as a real benchmark failure and inspect:

- login state in the dedicated Chrome profile
- the target chat URL
- `scripts/probe-userscript-first-load.mjs`

## Current guardrail

The current public alpha uses one real long ChatGPT thread as the main benchmark thread. That is good enough for iteration work, but it is still a narrow benchmark. Future work can add more benchmark threads after the current alpha runtime stabilizes further.
