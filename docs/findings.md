# Findings

Initial measurements on the real long conversation show that the first bottleneck is the oversized conversation payload itself, before later DOM and scrolling costs take over.

Most important numbers from the target conversation:
- Original conversation response size: about 5.0 MB
- Mapping nodes: about 1820
- Main branch nodes: about 1749
- Keeping the latest 120 message nodes cuts the payload by about 92 percent
- Keeping the latest 80 message nodes cuts the payload by about 94 percent
- Keeping the latest 20 message nodes cuts the payload by about 97.8 percent
- Keeping the latest 8 message nodes cuts the payload by about 98.6 percent
- Keeping the latest 4 message nodes cuts the payload by about 98.8 percent

Current public reading:
- The current public benchmark is still a 2-run pilot, not the final 5-run report
- The latest pilot now shows a small first-visible edge for the default `keep 8` profile: `14.35 s` versus raw ChatGPT at `14.54 s`
- The clearer repeatable win is still post-load behavior: on the current pilot thread, ConvoGlide completes the standardized long-scroll evaluation smoothly while the raw page often does not finish the evaluation cleanly
- The engineering-side passive soak checks are still useful for maintainers, but they are not the main public KPI
