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
npm run benchmark:lane -- "<chat-url>" --keep 8
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
- when the optimized page reached an engineering steady state
- whether a synthetic long scroll stayed smooth or became janky

## Run the user-facing lane

Use this when you want a repeated plain-vs-optimized check instead of a single run:

```bash
npm run benchmark:user-facing -- "<chat-url>" --iterations 2 --keep 8
```

Outputs:

- `artifacts/user-facing/latest.json`
- `artifacts/user-facing/latest.md`
- `artifacts/user-facing/history/<timestamp>.json`
- `artifacts/user-facing/history/<timestamp>.md`
- `artifacts/user-facing/raw/<timestamp>-plain-<n>.json`
- `artifacts/user-facing/raw/<timestamp>-optimized-<n>.json`

The user-facing lane summarizes median:

- first title time
- main response time
- render gap
- passive-soak counts at `50 s`
- scroll verdict counts

For public writing, prefer:

- **first-visible time**
- **standardized 4-screen long-scroll test**

Treat the `50 s` passive-soak counts as an engineering diagnostic, not the main user-facing KPI.

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

For the current public docs, describe the long-scroll probe as a **4-screen** test. The public reference distance is `3928 px`, derived from the default 14-inch MacBook Pro reference height (`982 px × 4`). During the current pilot phase, the implementation still caps travel distance by the actual available scroll range of the page.

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

Current public reporting rule:

- `n=2` is a **pilot benchmark**
- `n=5` is the target for the next public benchmark refresh after the current optimization pass is complete

If the lane still fails after retries, treat that as a real benchmark failure and inspect:

- login state in the dedicated Chrome profile
- the target chat URL
- `scripts/probe-userscript-first-load.mjs`

## Current guardrail

The current public alpha uses one real long ChatGPT thread as the main benchmark thread. That is good enough for iteration work, but it is still a narrow benchmark. Future work can add more benchmark threads after the current alpha runtime stabilizes further.
