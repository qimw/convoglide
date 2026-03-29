# ConvoGlide

**Make long AI chats feel fast again.**

ConvoGlide is an experimental open source project that reduces lag in long AI web conversations.

It currently focuses on **ChatGPT Web** first, with a roadmap for **Gemini**, **Claude**, and other long-thread chat apps.

## What problem this solves

Very long AI conversations often become painful in two different ways:

- **Slow first load**: the page takes too long to open because the conversation payload is huge.
- **Slow after load**: scrolling, typing, and interaction become janky once too much history stays rendered.

ConvoGlide is being built to attack both problems:

- trim oversized conversation payloads before the app hydrates
- reduce rendering pressure after load
- keep performance work measurable with repeatable test scripts

## Who this is for

- everyday ChatGPT users with long work or study threads
- heavy AI users who keep one conversation open for days or weeks
- people who do not code but still want a smoother experience
- developers who want to inspect, extend, and benchmark the approach

## Language strategy

ConvoGlide is meant for global users.

- **Primary language**: English
- **Code and comments**: English
- **Main README**: English first
- **Localized docs planned**: Simplified Chinese, Japanese, Korean, Spanish, Portuguese, French, and German

English will stay the source of truth, and translated docs will be added in separate files so non-English users can get started quickly.

## Fast start

### For non-technical users

The easiest path will be:

1. install a browser add-on or userscript manager
2. install ConvoGlide in one click
3. open your long AI conversation
4. let ConvoGlide reduce lag automatically

Today, the project is still in the prototype stage. The **userscript** path is the most practical runtime right now, and a simpler packaged browser extension is planned.

### For technical users

Current prototype layout:

- `userscript/`: preferred runtime prototype
- `extension/`: unpacked extension prototype
- `scripts/`: Chrome remote-debugging probes and analysis tools
- `docs/`: measurement notes and findings

Current recommended prototype entry:

- `userscript/convoglide.user.js`

## Current status

ConvoGlide is **experimental**.

What already exists:

- a userscript prototype for trimming oversized ChatGPT conversation payloads
- an extension prototype for early page hooks
- CDP-based scripts for measuring load behavior on real logged-in browser sessions
- findings from a real very long ChatGPT conversation

What is not finished yet:

- a polished one-click installation flow
- extension store packaging
- multi-site adapters beyond ChatGPT
- stable naming and UI cleanup across the codebase

## Development plan

### Phase 1: Project cleanup and public alpha

Estimated time: **1 to 2 days**

- rename project surfaces from the prototype name to ConvoGlide
- clean up README, package metadata, and repository structure
- make the userscript easier to install
- keep a simple benchmark workflow for reproducible testing

### Phase 2: Easier installation for non-coders

Estimated time: **2 to 4 days**

- package a browser extension for Chrome and Edge
- improve the install flow for Tampermonkey and Violentmonkey
- add a basic settings surface for common users
- write short beginner-friendly setup docs

### Phase 3: Better runtime optimization

Estimated time: **3 to 5 days**

- keep reducing first-load cost on huge conversations
- add stronger post-load virtualization and rendering reduction
- optimize heavy blocks such as large code snippets, tables, and rich content
- benchmark before and after changes on long real-world threads

### Phase 4: Multi-model support

Estimated time: **3 to 6 days**

- adapt the architecture for Gemini Web
- evaluate Claude Web and other chat UIs
- define a shared core with site-specific adapters

### Phase 5: Localization and distribution

Estimated time: **ongoing**

- publish multilingual docs
- improve onboarding for non-English users
- prepare browser store releases
- build a contribution guide for community translators and adapter authors

## Repository notes

This repository currently contains an early performance prototype imported from local experiments. The implementation will continue to evolve as we clean up naming, stabilize the runtime, and expand support beyond ChatGPT.

## License

MIT

## Experiment note

ConvoGlide is a pure **vibecoding** experimental project built with **Codex in the ChatGPT Plus plan**.
