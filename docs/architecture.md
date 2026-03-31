# Architecture

ConvoGlide treats long-thread lag as a user-experience problem first, and a rendering problem second.

The current alpha is intentionally scoped to **ChatGPT Web** and intentionally implemented as a **plugin-side progressive rendering layer**, not a replacement frontend.

## Product goal

For a very long conversation, the runtime should optimize in this order:

1. make the target thread visible sooner
2. make the thread operable sooner
3. keep long scrolling smooth
4. let older and heavier content become available progressively

In other words:

- first visible
- then operable
- then complete

## Scope boundary: what a plugin can and cannot do

ConvoGlide runs inside the browser as a userscript or extension. That gives it a useful interception and rendering surface, but it also sets hard limits.

### What the plugin can do

- intercept `conversation/<id>` responses before the page consumes them
- reconstruct the active branch from the tree-shaped payload
- trim the payload to a smaller user-visible bootstrap window
- virtualize off-screen history after load
- defer heavy off-screen blocks such as large `pre` and `table` nodes
- progressively restore older content later
- cache browser-side data for faster reopen behavior

### What the plugin cannot do

- change the ChatGPT backend so the server sends paginated history
- replace the official ChatGPT application state model or React tree
- prevent the browser from downloading the original response from the server
- guarantee that every cold start is dominated only by plugin-controlled work

That means the realistic design target is:

- **plugin-side progressive display**, not server-side pagination
- **user-perceived speedups**, not full control over every millisecond in the critical path

## Runtime model

The main conversation response is not a linear array. It is a tree-shaped payload built around:

- `mapping`
- `current_node`
- `parent`
- `children`

That matters because the currently visible thread is not handed to the frontend as a pre-sorted list. The active branch has to be reconstructed by walking backward from `current_node` through `parent` links and then reversing the path.

This model leads to two important design decisions:

- payload trimming must operate on the **active branch**, not on the full tree
- keep limits should be defined in terms of **user-visible messages**, not raw internal nodes

## Frontend loading framework

The most practical architecture for a plugin is a staged runtime with clear responsibilities.

### 1. Response Interceptor

Responsibilities:

- intercept oversized ChatGPT conversation payloads
- parse the tree-shaped response
- reconstruct the active branch
- build a smaller bootstrap payload for the first render

This layer is data-only. It should not touch the DOM.

### 2. Conversation Model

Responsibilities:

- normalize branch nodes into a predictable runtime model
- distinguish user-visible messages from internal nodes
- mark heavy blocks and restorable regions
- provide stable metadata for later virtualization and restoration

This is the layer that turns the server payload into something the later phases can schedule safely.

### 3. Bootstrap Window

Responsibilities:

- make the thread visible as early as possible
- only include the most recent **user-visible** messages needed for the first paint

The recommended shape is a two-stage bootstrap:

- **Stage A**: keep a very small bootstrap window for the first visible render
- **Stage B**: expand to a larger recent-history window after the page is already visible and the main thread is less contested

The current alpha now implements the first half of this idea in a plugin-safe way: on a cold uncached open, it can return a smaller bootstrap window to the current page while filling a larger trimmed result into local cache for the next reopen. The second half, true in-session widening after first visibility, remains harder because the plugin does not own ChatGPT's internal state tree.

This is the most important part of the first-load architecture. The key idea is not "load everything faster". The key idea is "show the smallest useful slice first".

### 4. Viewport Virtualizer

Responsibilities:

- keep the visible window and a small nearby buffer active
- replace far off-screen turns with placeholders
- restore them when the user scrolls back

This is the layer that fixes the "the thread is open, but scrolling is now heavy" problem.

### 5. Background Hydrator

Responsibilities:

- progressively restore older history after first visibility
- widen the recent-history window when safe
- schedule non-urgent work during idle time or after user interaction

This layer must always yield to the user. If it competes with first paint or scrolling, it is doing the wrong thing.

### 6. Heavy Content Strategy

Responsibilities:

- treat large `pre`, `table`, image, video, and iframe content as a separate budget category
- delay activation for off-screen heavy content
- restore on demand or when the content approaches the viewport

This keeps large blocks from dominating layout, paint, and memory cost inside already-active turns.

## Optimization layers

### Optimization 1: Slow first load

Symptoms:

- opening a very long ChatGPT thread takes too long
- the page stays on a generic shell before the conversation becomes available
- the conversation response is large enough to delay hydration

Strategy:

- intercept `conversation/<id>` responses
- reconstruct the active branch
- trim the first render down to a much smaller user-visible bootstrap window
- delay broader history restoration until after first visibility

This is the first-load layer.

### Optimization 2: Slow after load

Symptoms:

- scrolling becomes janky
- input starts lagging
- the page becomes heavy after the thread is already visible

Strategy:

- observe the rendered conversation surface
- keep nearby turns active
- replace far off-screen turns with placeholders
- restore them when the user scrolls back

This is the post-load virtualization layer.

### Optimization 3: Heavy blocks stay expensive inside active turns

Symptoms:

- large code blocks remain expensive even when the turn stays active
- big tables keep layout and paint cost high
- media-heavy turns still benefit from browser-level lazy hints

Strategy:

- defer off-screen heavy `pre` blocks
- defer off-screen heavy `table` blocks
- apply lazy-loading hints to images, videos, and iframes
- restore deferred heavy blocks when the user scrolls back

This is the heavy-content layer.

## Evaluation framework

The benchmark should focus on user-facing milestones first.

### Primary UX metrics

- **First-visible time**
  - when the target thread first becomes visible
- **First-operable time**
  - when the thread first becomes readable and safely scrollable
- **Standardized 4-screen long-scroll test**
  - whether the page remains smooth during a fixed long-scroll evaluation

The long-scroll reference distance uses a 14-inch MacBook Pro default logical height of `982 px`, so the public reference distance is `3928 px`.

### Diagnostic metrics

- **Main conversation response time**
  - how long `conversation/<id>` takes to return
- **Render gap**
  - how long the browser still needs after the main conversation response arrives
- **Visible branch size**
  - how large the benchmark thread is in user-facing message terms
- **Average message and round length**
  - how content-heavy the benchmark thread is

### Engineering metrics

- payload bytes
- steady-state DOM size
- heap usage
- virtualized turns
- deferred heavy blocks

## Current targets

The current public alpha should aim for these outcomes on the benchmark thread.

### Public targets

- cold-start **first-visible time**: median `<= 15 s`
- cold-start **first-operable time**: median `<= 16 s`
- warm-reopen **first-visible time**: median `<= 6 s`
- **4-screen long-scroll test**: `smooth` in `5/5` runs

### Engineering targets

- **render gap**: `<= 1.5 s`
- steady DOM on the default profile: `<= 3.0k`
- steady heap on the default profile: `<= 90 MB`

These targets are intentionally split. Some latency comes from OpenAI network and backend behavior, which the plugin cannot fully control. The plugin should still reduce the work that happens after the response arrives and the work that remains on screen after load.

## Why this split matters

This staged design keeps the project honest:

- first-load optimization reduces the amount of content that participates in first paint
- post-load virtualization keeps scrolling and interaction healthy later
- heavy-content deferral reduces cost inside still-active turns
- explicit plugin boundaries stop the project from promising server-side behavior it cannot actually implement

## Current alpha tradeoff

The current virtualization MVP is optimized first for:

- reducing off-screen DOM pressure
- preserving fast restore when the user scrolls back

To do that, it currently keeps detached turn and heavy-block snapshots in memory. That means the alpha can already lower DOM cost a lot, but heap reduction may lag behind DOM reduction until a later pass changes how off-screen content is stored and restored.

## Current scope boundary

The current alpha is intentionally ChatGPT-only.

That keeps four things aligned while the project is still experimental:

- runtime assumptions
- benchmark definition
- install surface
- release surface

Future expansion is possible, but it is not part of the current alpha plan.
