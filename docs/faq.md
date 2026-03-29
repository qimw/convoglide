# FAQ

## Does ConvoGlide upload my conversations?

No. The current alpha is local-only browser-side logic.

## Does ConvoGlide delete my ChatGPT history?

No. It changes browser-side rendering behavior and intercepted response shape in your local session. It does not delete the server-side conversation.

## Why are there two optimizations?

Because there are two different performance problems:

- **slow first load**
- **slow after load**

ConvoGlide handles them with separate strategies on purpose.

## Why is ChatGPT the only officially supported target right now?

The current alpha is intentionally ChatGPT-first so the runtime, docs, benchmark method, install flow, and release process can become stable together before the project widens its scope.

## Is the browser extension packaged for the store already?

No. The current alpha supports side-loading only. Store packaging is a later milestone.

## Why does changing the keep limit ask me to reload?

The active-branch trimming limit applies to intercepted conversation payloads. Reloading makes sure the new limit is used for the next conversation fetch.

## Why is the default keep limit `20` if some benchmark tables still use `80`?

Because they serve different purposes:

- `20` is the current public default for getting very long threads on-screen faster
- `80` is still the better stress profile for showing how post-load virtualization behaves when more recent history stays visible

## Why can search briefly pause virtualization?

The post-load virtualization MVP pauses around browser find-in-page so off-screen content can be restored while searching.

## Why did DOM improve more clearly than heap in the first virtualization benchmark?

Because the current alpha keeps detached turn snapshots for fast restore when you scroll back. That already helps DOM pressure and interaction cost, but it means memory behavior still needs another tuning pass.

## Is this production-ready?

Not yet. It is an experimental alpha with real measurements, but it still needs more benchmark coverage and tuning.
