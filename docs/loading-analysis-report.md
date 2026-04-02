# Loading Analysis Report

This report explains how the long-thread ChatGPT page loads, what data it returns, which code paths matter, where time is spent, why the current ConvoGlide alpha helps in some cases but not others, and what the next optimization step should be.

The report is based on:

- real network captures from the benchmark thread
- real cold-start and warm-reopen probe runs
- runtime code in `src/runtime/chatgpt-core.js`
- analysis scripts in `scripts/`

This document is intentionally more detailed than the README and benchmark summary docs. It is meant to answer "what is really happening" before further optimization work continues.

## Scope

This report covers one benchmark thread:

- Chat URL path:
  `g/g-p-68f4c49db7808191aa939c964a7e19f8-sheng-huo/c/699b2b0c-5dc4-8333-a6dd-e88ac7753511`

The purpose is not to claim universal results for every ChatGPT thread. The purpose is to understand the loading mechanism of one real, extreme long-thread case well enough to make correct architectural decisions.

## Executive Summary

The first-load bottleneck is not a small setup request. It is the combination of:

1. a very large main conversation response
2. a tree-shaped response format that the frontend must reconstruct into an active branch
3. additional frontend work after the response arrives, before the page title and visible thread state settle

ConvoGlide already proves two things:

- warm reopen can become much faster through local cache reuse
- post-load scrolling can remain smooth through virtualization and heavy-block deferral

ConvoGlide does **not** yet stably solve cold-start first-visible time. The main reason is no longer "the keep value is too high". The real issue is that the cold-start bootstrap payload shape is not yet stable enough for the official frontend to establish the active thread state quickly and consistently.

The next high-value step is not more blind tuning of `bootstrap=2/3/4`. The next high-value step is to redesign bootstrap trimming around **recent turn windows**, not just "last N visible messages".

## Evidence Sources

### Runtime code

- `src/runtime/chatgpt-core.js`

### Probe and analysis scripts

- `scripts/probe-userscript-first-load.mjs`
- `scripts/analyze-first-load-responses.mjs`
- `scripts/analyze-conversation-body.mjs`
- `scripts/profile-conversation-branch.mjs`

### Existing benchmark artifacts

- `artifacts/user-facing/raw/*.json`
- `artifacts/benchmarks/*.json`

### Fresh measurements used while preparing this report

- first-load oversized response scan
- conversation branch profile
- cold-start bootstrap probe comparisons

## Part I: Data Analysis Report

### 1. First-load response inventory

The first-load response scan shows that the main conversation response is still the dominant payload:

| Endpoint | Approx size | Notes |
| --- | ---: | --- |
| `backend-api/conversation/<id>` | `~5.13 MB` | Main conversation payload, by far the largest response |
| `backend-api/aip/connectors/list_accessible` | `~1.15 MB` | Large, but still much smaller than the main conversation |
| `backend-api/apps/sources_dropdown` | `~291 KB` | Significant secondary payload |
| `backend-api/system_hints?mode=connectors` | `~84 KB` | Not dominant |
| `backend-api/sentinel/chat-requirements/prepare` | `~70 KB` | Not dominant |
| `backend-api/tasks` | `~59 KB` | Not dominant |
| `backend-api/models?...` | `~36 KB` | Not dominant |
| `backend-api/conversations?...` | `~21 KB` | Sidebar list, not dominant |

Conclusion:

- the main conversation response is the first-order payload problem
- connectors and sources are meaningful secondary costs
- the loading story should still start from the conversation response, not from the smaller setup requests

### 2. Benchmark thread profile

The benchmark thread itself is extreme:

| Metric | Value |
| --- | ---: |
| Main response size | `5,127,910 - 5,132,286 bytes` |
| Mapping nodes | `1854` |
| Active-branch nodes | `1779` |
| Active-branch message nodes | `1778` |
| Q+A rounds | `371` |
| Average message length | `451` chars |
| Average user message length | `112` chars |
| Average assistant message length | `901` chars |

Role distribution on the active branch:

| Role | Count |
| --- | ---: |
| `assistant` | `813` |
| `user` | `578` |
| `system` | `300` |
| `tool` | `87` |

Content-type distribution on the active branch:

| Content type | Count |
| --- | ---: |
| `text` | `1495` |
| `multimodal_text` | `46` |
| `model_editable_context` | `35` |
| `thoughts` | `86` |
| `execution_output` | `2` |
| `reasoning_recap` | `75` |
| `code` | `38` |
| `tether_browsing_display` | `1` |

This means the benchmark thread is not merely "a lot of turns". It is also content-heavy, and it contains many non-user-facing structural nodes that still participate in the active branch.

### 3. The branch is not a simple user/assistant list

The last 10 active-branch messages include:

- multiple user messages
- multiple assistant messages
- trailing `system` entries near the tail

That matters because a bootstrap strategy based only on "keep the last N visible messages" can accidentally cut away nearby structural nodes that the official frontend may still expect when rebuilding the active thread state.

### 4. Largest-message profile

The largest individual messages are in the `3k - 4.5k` character range. Several of them are assistant messages, and some are user multimodal messages.

This matters for two reasons:

1. message count alone understates actual rendering weight
2. even a small visible tail can still contain large text blocks

## Part II: Loading Mechanism Report

### 1. High-level loading pipeline

The long-thread page does not load through a single request. At a high level, the pipeline looks like this:

1. route shell opens
2. the page issues multiple parallel requests
3. the main conversation request returns
4. the frontend reconstructs the active branch from the tree payload
5. the official UI establishes thread state
6. the page title changes to the thread title
7. post-load work continues

The key insight is:

**the page does not become meaningfully visible the moment the conversation response arrives**

There is often a significant gap between:

- response arrival
- first resolved title

### 1.1 Detailed cold-start timeline example

One representative cold-start sample with `bootstrap keep 4 visible` looked like this:

| Time | Event |
| --- | --- |
| `3.5 s` | `gizmos/bootstrap?limit=2` returned |
| `4.1 s` | `conversation/init` returned |
| `4.7 - 5.0 s` | sidebar and conversation list requests returned |
| `11.8 s` | a second cluster of gizmo/sidebar requests returned |
| `13.9 s` | another `conversation/init` returned |
| `17.1 s` | main `conversation/<id>` returned |
| `20.2 s` | first resolved title appeared |
| `20.2 s` | the probe snapshot already showed phase `fetch-bootstrap` |
| `20.2 s` | `textdocs` arrived almost immediately after first visible |
| `35 - 58 s` | page stayed stable; post-load optimizers eventually entered `lazy-heavy` |

Interpretation:

- the page does not wait for `textdocs` to become first-visible
- the page **does** appear to wait for the main conversation response plus enough official frontend work to attach the real thread title
- `conversation/init` is not the critical gating request for first visible

### 1.2 Detailed cold-start failure example

One representative cold-start sample with `bootstrap keep 2 visible` looked like this:

| Time | Event |
| --- | --- |
| `2.4 s` | `gizmos/bootstrap?limit=2` returned |
| `3.5 s` | `conversation/init` returned |
| `3.8 - 4.0 s` | sidebar and conversation list requests returned |
| `15.3 - 16.3 s` | second cluster of gizmo/sidebar/stream-status requests returned |
| `18.7 s` | main `conversation/<id>` returned |
| `22.5 s` | another `conversation/init` returned |
| `32.3 s` | `textdocs` returned |
| `35.1 s` | first resolved title appeared |

Interpretation:

- the main conversation returned at `18.7 s`
- the title still stayed unresolved for about `16.4 s` after that
- the payload rewrite did happen, but the official frontend still did not present the thread promptly

This is the clearest evidence that the bottleneck is not just "network wait". It is also "frontend acceptance of the rewritten branch shape".

### 1.3 Detailed warm-reopen timeline example

One representative warm-reopen sample with cache reuse looked like this:

| Time | Event |
| --- | --- |
| `3.3 s` | shell sample still showed title `ChatGPT` |
| `6.3 s` | first resolved title appeared |
| `6.3 s` | phase was already `cache-hit` |
| `8.5 - 12.5 s` | gizmo/sidebar/stream-status requests returned |
| `16.2 s` | main `conversation/<id>` returned |
| `16.2 s` | the user had already been looking at the thread for roughly `10 s` |
| `35 - 52 s` | heavy-block deferral and later stabilization completed |

Interpretation:

- warm reopen proves that the first visible state does **not** require the real main conversation response to finish
- it only requires a frontend-acceptable early slice
- therefore the design direction is valid, even though the cold-start payload shape still needs work

### 2. Main conversation payload shape

The main conversation response is not a linear message array. It is a tree-shaped object centered on:

- `mapping`
- `current_node`

Each mapping entry contains relationships such as:

- `id`
- `parent`
- `children`
- `message`

The active branch must be reconstructed by walking backwards from `current_node` through `parent`, then reversing the collected chain.

Implications:

- the frontend must perform extra reconstruction work before it can render the current thread linearly
- trimming cannot safely operate on the full tree blindly
- trimming must preserve a branch shape the frontend can still accept

### 3. First-load request timing behavior

Cold-start and warm-reopen samples consistently show:

- some setup requests can finish early
- the main conversation request is still the dominant payload handoff
- the title can remain unresolved long after the main conversation response arrives
- the conversation request can still arrive much later
- even after the conversation request arrives, the title may still stay as `ChatGPT` for a while

This means first-visible time is controlled by two distinct phases:

1. **response wait**
2. **post-response frontend acceptance and state establishment**

The second phase is often underestimated.

## Part III: Official Frontend Bundle Findings

To reduce guesswork, we pulled and inspected the largest production bundles that the benchmark thread page actually loads.

The working method was:

1. scan the live page for script inventory
2. rank scripts by parsed source length
3. fetch selected bundle bodies from the page context
4. search for conversation-tree and title-related code paths

This does not provide original source modules or comments, but it is strong enough to identify the relevant runtime responsibilities.

### 1. Bundle inventory

The benchmark page loaded roughly `250+` parsed scripts. The largest ones were:

| Script ID | Approx parsed length | URL suffix |
| --- | ---: | --- |
| `13` | `3.36 MB` | `1a7ebd5f-gri5dbq8utrbgkwq.js` |
| `9` | `1.91 MB` | `4813494d-n5zv9s4atplnbc8o.js` |
| `70` | `1.68 MB` | `24c0da2c-ljc942fwhhp7fcgk.js` |
| `8` | `771 KB` | `2340486e-l27h072476k5h6bt.js` |
| `5` | `734 KB` | `04a8820c-iuorkk0nfo5lovcs.js` |

### 2. Script 9 owns the API-tree to internal-thread conversion

The clearest evidence appears in script `9` (`4813494d-n5zv9s4atplnbc8o.js`).

We found a function of the form:

- `function RCe(e, t) { ... }`

That function:

1. iterates over `e.moderation_results`
2. iterates over `Object.values(e.mapping)`
3. converts raw API nodes into internal `zs` tree nodes
4. returns:
   - `nodes`
   - `initialCurrentLeafId: e.current_node`

The important part is not the exact minified symbol name. The important part is the role:

> script 9 is where the server conversation payload gets normalized into the client-side conversation tree and current-leaf state.

That means the official frontend has a distinct "tree normalization + current leaf establishment" phase after the payload arrives.

### 3. Script 9 also shows how thread readiness propagates

Nearby call sites in the same bundle show the next stage:

1. call `RCe(t, conversationId)`
2. derive a root fallback
3. build a `zs` tree with `Z2(h.nodes, currentLeafId)`
4. walk `getBranch()`
5. reconcile existing tree state
6. call `setCurrentLeafId(...)`
7. store the resulting thread back into the thread store

This is a strong confirmation of the architectural model:

- the API payload is not directly rendered
- it is first normalized into an internal tree
- then the current branch is established
- then the thread store is updated

This explains why "payload got smaller" does not automatically mean "first visible became faster". The frontend still has to accept the rewritten payload shape and successfully establish the current leaf.

### 4. Script 13 owns document-title side effects

In script `13` (`1a7ebd5f-gri5dbq8utrbgkwq.js`), we found a component pattern equivalent to:

- inspect children
- find an element with `type === "title"`
- extract its string child
- run an effect that temporarily sets `document.title`

In other words:

> the title is updated through a React `<title>` side-effect wrapper, not as a primitive network event.

This matters because it confirms that title updates happen only after the relevant React subtree is mounted with the right title content.

So title timing is:

- easy to observe
- useful as an "official-thread-ready-ish" signal
- but **not** a guaranteed proxy for the first moment the user can see meaningful content

### 5. Why these bundle findings change the optimization strategy

Before bundle inspection, it was possible to believe:

- smaller bootstrap payload -> faster first visible

The bundle findings show why that is incomplete.

The official frontend expects enough shape to:

1. normalize `mapping`
2. establish `initialCurrentLeafId`
3. build the internal `zs` tree
4. set the current leaf
5. mount the React subtree that eventually updates title

If a bootstrap payload becomes too small or structurally odd, it may reduce bytes while making this state-establishment pipeline less stable.

That is exactly consistent with the earlier empirical result:

- `bootstrap=2` was often worse than `bootstrap=3/4`

### 6. Refined interpretation

At this point, the loading model becomes:

1. **network phase**
   - fetch main conversation payload
2. **frontend normalization phase**
   - convert `mapping/current_node` into an internal conversation tree
3. **thread-establishment phase**
   - choose and set current leaf / branch
4. **React visibility phase**
   - mount the conversation view and title subtree
5. **post-load interaction phase**
   - scrolling, virtualization, heavy-content activation

This is the main reason previous metrics felt inconsistent:

- some of them measured network
- some measured title
- some measured post-load smoothness
- but they did not cleanly isolate the normalization and thread-establishment phase

## Part IV: Revised Bottleneck Model

The primary cold-start bottleneck is no longer best described as "a large payload".

It is more precise to say:

> A large tree-shaped payload arrives, then the official frontend must normalize it into an internal tree, establish the current branch, and only then can the visible thread and title settle.

That leads to the following bottleneck stack:

1. **main conversation payload size**
2. **frontend tree normalization cost**
3. **frontend current-leaf / branch establishment cost**
4. **React subtree mount that eventually resolves the title**
5. **post-load DOM cost**

ConvoGlide already helps strongly with item `5`, and helps warm-reopen cases by short-circuiting part of items `1-4`.

The remaining cold-start problem is mainly in items `2-4`.

### 3.1 Request classes observed during first load

The first-load request set can be grouped into these classes:

#### Route and sidebar setup

- `backend-api/gizmos/bootstrap?limit=2`
- `backend-api/gizmos/snorlax/sidebar?...`
- `backend-api/conversations?...`
- `backend-api/gizmos/<gizmo-id>`

These requests often return before the main conversation, but they do not by themselves make the thread visible.

#### Conversation metadata and progress

- `backend-api/conversation/init`
- `backend-api/conversation/<id>/stream_status`

These are part of the route and thread setup story, but current evidence does not support treating them as the primary first-visible gate.

#### Main thread content

- `backend-api/conversation/<id>`

This is the dominant payload and the most important first-load response.

#### Secondary thread content

- `backend-api/conversation/<id>/textdocs`

This can arrive after or around first visible. It appears relevant to completeness, but not to the earliest visible milestone.

#### Large secondary feature payloads

- `backend-api/aip/connectors/list_accessible?...`
- `backend-api/apps/sources_dropdown`

These are large enough to matter, but current evidence still puts them below the main conversation in priority.

### 4. Why title change matters

The current user-facing probe uses "title changed from `ChatGPT` to the target thread title" as the first-visible proxy.

This is imperfect, but still useful, because it indicates that the official frontend has advanced far enough to attach the thread identity to the document.

In practice, the title change behaves as a good approximation for:

- active thread state established
- route-level thread context visible

It is therefore a reasonable first-visible milestone, even if it is not the final definition of "fully ready".

### 5. Warm reopen behavior

A warm-reopen sample showed:

- first resolved title around `6.3 s`
- phase `cache-hit`
- the real main conversation response not returning until roughly `16.2 s`

This is extremely important.

It proves that the UX strategy itself is correct:

- users do not need to wait for the full real conversation response
- if the page gets a sufficiently good local slice early, the first visible state can happen much sooner

This means the plugin is already conceptually on the right track. The remaining problem is cold-start data shape, not the general idea of "show something useful first".

### 6. Observed first-load state transitions

Across the current samples, the user-visible state transitions look roughly like this:

1. `ChatGPT` shell title
2. route shell with initial DOM
3. main conversation request starts or continues in background
4. ConvoGlide may emit one of:
   - `cache-hit`
   - `fetch-bootstrap`
   - `fetch-trim`
5. official frontend eventually accepts enough thread state
6. document title changes to the target thread title
7. post-load optimizers start through:
   - title-ready path
   - fallback timer
   - first user interaction

This is important because it shows the first-visible milestone is downstream from both:

- network completion
- official frontend state-establishment work

## Part III: Code Analysis Report

### 1. Runtime entry points

The central runtime is in `src/runtime/chatgpt-core.js`.

The most relevant pieces are:

- `convoglideExtractActiveBranchIds`
- `convoglideTrimConversationPayload`
- `installFetchHook`
- `readConversationCacheEntry`
- `writeConversationCacheEntry`
- `armPostLoadActivation`
- turn virtualization
- heavy-block lazy activation

### 2. Branch reconstruction logic

`convoglideExtractActiveBranchIds(payload)` reconstructs the active branch from:

- `payload.mapping`
- `payload.current_node`

It walks parents backward, records visited IDs, then reverses the result.

This is the correct basis for trimming because the payload is tree-shaped.

### 3. Current trimming logic

`convoglideTrimConversationPayload(payload, maxMessageNodes, options)` currently:

1. reconstructs the active branch
2. counts only user-facing message nodes
3. trims earlier branch content away
4. rewrites the kept branch as a simplified linear mapping rooted at `convoglide-root`

This is already better than trimming by raw mapping size, but it still has a limitation:

- it is based on a count of user-facing messages
- it does not explicitly preserve recent **turn windows** plus nearby structural nodes as a first-class concept

That limitation likely matters for cold-start stability.

### 4. Fetch interception behavior

`installFetchHook()` overrides `window.fetch`.

For main conversation GET requests, it does this:

1. checks local cache for `conversationId + keep`
2. if cache exists:
   - returns cached text immediately
   - starts a background refresh fetch
3. if cache does not exist:
   - waits for the real response
   - reads the JSON body
   - optionally rewrites it with `preferBootstrap`
   - stores the normal trimmed `keep` result in local cache
   - returns the rewritten response to the page

This design is why warm reopen is fast.

### 4.1 Fetch interception control flow

For a main conversation request, the control flow is:

1. identify that the request URL matches `conversation/<id>`
2. read the configured `keep` limit from localStorage
3. read a cached conversation entry, if one exists
4. if cache exists:
   - emit `cache-hit`
   - return cached JSON immediately
   - asynchronously refresh the real response in the background
5. if cache does not exist:
   - wait for the real response
   - parse JSON
   - optionally apply bootstrap trim for the current page
   - always write the normal trimmed result to local cache
   - return the rewritten response

This split is one of the most important properties of the current runtime:

- **cold start** can receive a smaller bootstrap slice
- **warm reopen** can still reuse a more useful normal cache slice

### 5. Bootstrap behavior

Cold-start bootstrap currently works by:

- using a smaller bootstrap keep limit for the current page
- while still caching the larger normal `keep` result for later reuse

In code terms:

- `resolveBootstrapMaxMessageNodes(maxMessageNodes)`
- `maybeRewriteResponseText(..., { preferBootstrap: true })`

If bootstrap is active and smaller than the normal keep:

- the current page gets the smaller payload
- the cache stores the larger normal trim

This is good in principle because it separates:

- cold-start visible slice
- warm-reopen reusable slice

### 5.1 Why bootstrap currently behaves inconsistently

The current bootstrap rewrite is still based on user-facing message count:

- keep the last N visible user/assistant messages

That is better than trimming by raw mapping count, but the active branch data shows a problem:

- the branch tail is not composed of only user and assistant nodes
- nearby `system` and `tool` nodes still exist near the live tail

So the current bootstrap policy optimizes for:

- user-visible message count

but the official frontend appears to need:

- a coherent active-thread state shape

Those are related, but not identical.

### 6. Cache-hit path

When cache exists, the runtime emits:

- `phase: "cache-hit"`

and returns a synthetic `Response` immediately, with:

- `content-type: application/json`
- `x-convoglide: cache-hit`

This path is the clearest proof that the plugin can materially improve first-visible UX without controlling the official backend.

### 7. Post-load activation logic

`armPostLoadActivation()` controls when post-load optimizers start.

Current triggers:

- title becomes resolved
- fallback timer
- first interaction

The title-resolved trigger is important because it means:

- ConvoGlide intentionally stays out of the early path until the page title looks ready
- the runtime is already trying not to compete with first-load state establishment

That is good, but it also means post-load work is **not** the main cause of the cold-start title lag observed in bad samples.

### 7.1 Post-load trigger ordering

The runtime currently arms three possible post-load triggers:

1. title-ready trigger
2. fallback timer trigger
3. first user interaction trigger

This means the plugin is already attempting to avoid competing with the first-visible path. In other words:

- if cold-start first visible is poor
- the first suspect should be the bootstrap payload shape or official frontend acceptance path
- not the turn virtualizer or heavy-block layer

### 8. Virtualizer and heavy-block layer

After post-load starts:

- turn virtualization may replace off-screen turn content with placeholders
- heavy-block lazy activation may replace large off-screen code/table blocks with lightweight placeholders

This layer clearly helps smoothness after load, but it is not the main determinant of cold-start first-visible time.

## Part IV: Why Some Experiments Worked and Others Failed

### 1. What clearly works

#### Warm reopen

Warm reopen works because the plugin can provide a locally cached, already-trimmed conversation slice before the real request returns.

#### Post-load scrolling

Scrolling stays smooth because the runtime can safely virtualize or defer content after the UI has already established the active thread.

### 2. What clearly fails

#### Cold-start `bootstrap=2`

Cold-start `bootstrap=2` performed badly in repeated samples. Example outcomes included:

- `35.1 s`
- `24.3 s`

Even when the conversation response itself returned early, the title stayed unresolved for a long time.

This strongly suggests that the page was not happy with the shape of the too-small bootstrap payload, even though the payload rewrite technically succeeded.

### 3. Why "smaller is better" is false here

The main lesson from the bootstrap experiments is:

**smaller is not always better**

If the payload becomes too small:

- the user-visible content count may still look sufficient
- but the official frontend may take much longer to accept that payload as a coherent active thread

So the real target is not:

- the smallest possible visible slice

The real target is:

- the smallest slice that still lets the official frontend establish thread state quickly and consistently

### 4. Why the render gap matters more than total time

In several bad cold-start runs, the main conversation returned much earlier than the first visible milestone.

Examples:

- `bootstrap=2` sample:
  - main conversation response: `18.7 s`
  - first visible title: `35.1 s`
  - render gap: about `16.4 s`

- a worse earlier sample:
  - main conversation response: about `19.3 s`
  - first visible title: about `53.9 s`
  - render gap: about `34.6 s`

This shows that first-load optimization cannot be judged by network timing alone. The more actionable metric is:

- **render gap**

because ConvoGlide can influence that more directly than it can influence backend latency.

## Part V: Bottleneck Analysis

### Bottleneck A: Oversized main conversation payload

The conversation response is still the biggest network cost. This is unavoidable at the plugin layer because the plugin cannot ask the server to paginate differently.

Plugin implication:

- the plugin cannot remove the download cost
- the plugin **can** reduce the work the official frontend performs after the response arrives

### Bottleneck B: Frontend state establishment after response arrival

This is the most important current bottleneck.

Symptoms:

- response arrives
- title still stays as `ChatGPT`
- first-visible is delayed

Interpretation:

- the official frontend still needs enough coherent branch shape and metadata to establish thread state
- current bootstrap trimming sometimes interferes with that

### Bottleneck B1: Thread-state coherence, not just thread-size reduction

The current evidence suggests the cold-start problem is not simply:

- "the payload is still too large"

It is more specifically:

- "the rewritten payload is not always the right shape for fast state establishment"

That explains why:

- smaller bootstrap windows can perform worse
- warm cache can perform much better
- scrolling can already be smooth later

### Bottleneck C: Secondary large responses

Connectors and sources are nontrivial, but they are still secondary.

They matter because:

- they increase total first-load pressure
- they can compete for bandwidth and main-thread work

But the current evidence does **not** justify making them the primary optimization target before the main conversation bootstrap shape is fixed.

### Bottleneck D: Post-load rendering pressure

This was the dominant bottleneck only **after** the page became visible.

ConvoGlide already addresses much of this through virtualization and heavy-block lazy activation.

## Part VI: Capability Boundaries

### What a plugin can do

- intercept responses in the browser
- rewrite the conversation JSON before the page consumes it
- cache trimmed conversation slices
- virtualize off-screen DOM after load
- defer heavy content activation
- render plugin-owned UI overlays if needed

### What a plugin cannot do

- make the official server return paginated first-load slices
- rewrite the official backend contract
- directly control internal React/router state transitions
- guarantee that the official page title updates earlier unless it accepts the rewritten payload

This boundary matters. It means the next solution must remain realistic for a plugin.

## Part VII: Recommended Optimization Direction

### 1. Replace message-count bootstrap with turn-window bootstrap

This is the next most important change.

The current strategy is:

- keep the last N visible messages

The next strategy should be:

- keep the last K user/assistant turns
- preserve nearby structural nodes needed to make those turns coherent for the official frontend

Why:

- the active branch contains many `system` and `tool` nodes
- some of them appear near the tail
- trimming only by visible-message count is too blunt

Desired behavior:

- preserve a recent conversation window that matches how humans read the chat
- preserve enough adjacent structure that the official frontend can still reconstruct thread state quickly

### 1.1 What "turn-window bootstrap" means concretely

A turn-window bootstrap should:

1. walk the active branch from the tail backward
2. count user-to-assistant turn pairs, not just raw visible-message count
3. preserve the structural nodes that occur within or immediately around those tail turns
4. rewrite the kept tail as the smallest coherent branch slice

That is different from the current policy, which mainly asks:

- how many visible messages remain

The better question is:

- how many recent turns remain, and does their local structure remain coherent

### 2. Keep cold-start and warm-reopen strategies separate

They should not be treated as one knob.

Cold start should optimize for:

- smallest stable state-establishing slice

Warm reopen should optimize for:

- quickest reusable near-recent slice

These are related, but not identical optimization goals.

### 3. Consider a plugin-owned preview shell if turn-window bootstrap is still unstable

If turn-window bootstrap still cannot stabilize first-visible time, the next realistic plugin move is:

- render a tiny ConvoGlide preview shell before the official title resolves

That shell could show:

- thread title
- last 1 to 2 turns
- syncing state

This would let the plugin define "first visible" in UX terms, instead of waiting for the official title mechanism.

This is more invasive, but still realistic for a plugin.

### 4. Do not spend the next round primarily on peripheral endpoints

The next round should **not** focus on:

- connectors payload trimming
- sources dropdown trimming
- unrelated side requests

Not because they do not matter, but because the evidence says the highest ROI is still:

- main conversation bootstrap shape
- official frontend state-establishment latency

## Part VIII: Practical Next Steps

### Immediate next implementation step

Implement **turn-window bootstrap trimming** in the main conversation rewrite path.

Concrete goal:

- bootstrap by recent turns, not just recent visible-message count

### Immediate next validation step

Run a small cold-start pilot comparing:

- current visible-message bootstrap
- turn-window bootstrap

Compare:

- first-visible time
- main response time
- render gap
- scroll verdict

### Immediate non-goal

Do **not** spend the next iteration polishing docs or tweaking peripheral endpoint handling until the turn-window bootstrap question is answered.

## Final Conclusion

The loading mechanism is now clear enough to support a concrete architectural decision.

The current system already proves that:

- showing a useful local slice first is the right user-experience direction
- warm reopen and post-load smoothness can be improved substantially within plugin limits

The unresolved cold-start problem is not caused by lack of experiments. It is caused by the fact that the current bootstrap payload is optimized mainly for **smallness**, while the official frontend needs a payload optimized for **state-establishment stability**.

That is why the next optimization step should be:

**replace cold-start visible-message bootstrap with a recent-turn-window bootstrap that preserves the minimum coherent branch structure needed by the official frontend**

Only if that still fails should the project escalate to a plugin-owned preview shell for first-visible UX.

## Appendix: Current Working Mental Model

The current loading mechanism can be summarized like this:

1. ChatGPT loads a route shell and several setup requests
2. the main conversation arrives as a large tree
3. ConvoGlide can rewrite that tree before the official frontend consumes it
4. the official frontend still decides when the thread title and visible thread state are truly established
5. ConvoGlide can then help further through:
   - local cache reuse
   - post-load virtualization
   - heavy-block deferral

Therefore:

- warm reopen success proves the UX direction is valid
- cold-start instability proves the bootstrap payload shape still needs redesign
