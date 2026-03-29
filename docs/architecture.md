# Architecture

ConvoGlide treats long-thread lag as a stack of related performance problems.

## Problem 1: Slow first load

Symptoms:

- opening a very long ChatGPT thread takes too long
- the page stays on a generic shell before the conversation becomes available
- the conversation response is large enough to delay hydration

Current strategy:

- intercept `conversation/<id>` responses
- trim the active branch to the most recent message nodes
- pass a much smaller payload to the app before hydration

This is **Optimization 1**.

## Problem 2: Slow after load

Symptoms:

- scrolling becomes janky
- input starts lagging
- the page becomes heavy after the thread is already visible

Current strategy:

- observe the rendered conversation surface
- keep nearby turns active
- replace far off-screen turns with placeholders
- restore them when the user scrolls back

This is **Optimization 2**.

## Problem 3: Heavy blocks stay expensive inside active turns

Symptoms:

- large code blocks are still expensive even when the surrounding turn stays active
- big tables can keep layout and paint cost high
- media-heavy turns still benefit from browser-level lazy hints

Current strategy:

- defer off-screen heavy `pre` blocks
- defer off-screen heavy `table` blocks
- apply lazy-loading hints to images, videos, and iframes
- restore deferred heavy blocks when the user scrolls back

This is **Optimization 3**.

## Runtime shape

The current alpha uses one shared ChatGPT runtime core:

- payload trimming
- config handling
- debug state publishing
- post-load virtualization
- heavy block lazy activation

It is wrapped by:

- a userscript runtime
- a browser extension page-hook runtime

The extension also uses a content script for the badge UI.

## Why the split matters

Separating these two optimization layers keeps the project honest:

- payload trimming helps the page become usable sooner
- virtualization helps it stay usable longer
- heavy block deferral reduces cost inside still-active turns

This also makes future benchmark tables easier to interpret.

## Current alpha tradeoff

The current virtualization MVP is optimized first for:

- reducing off-screen DOM pressure
- preserving fast restore when the user scrolls back

To do that, it currently keeps detached turn and heavy-block snapshots in memory. That means the alpha can already lower DOM cost a lot, but heap reduction may lag behind DOM reduction until a later pass changes how off-screen content is stored and restored.

## Future architecture direction

Once the ChatGPT alpha is stable, the next step is to extract site-specific logic behind adapters so the same shared runtime ideas can be evaluated on Gemini and then Claude.
