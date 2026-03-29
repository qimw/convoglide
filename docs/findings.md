# Findings

Initial measurements on the real long conversation show that the first bottleneck is the oversized conversation payload itself, before later DOM and scrolling costs take over.

Most important numbers from the target conversation:
- Original conversation response size: about 5.0 MB
- Mapping nodes: about 1820
- Main branch nodes: about 1749
- `conversation/init` is tiny at about 654 bytes
- `conversation/<id>/textdocs` is effectively empty at `[]`
- Keeping the latest 120 message nodes cuts the payload by about 92 percent
- Keeping the latest 80 message nodes cuts the payload by about 94 percent

Observed runtime behavior on the target conversation:
- Without interception, the page eventually becomes hard to probe once the real conversation view is reached
- With ConvoGlide at `120`, the conversation stays probeable through 50 seconds, but steady-state DOM still reaches roughly 11.8k nodes
- With ConvoGlide at `80`, the conversation stays probeable through 50 seconds and steady-state DOM drops to roughly 9.1k nodes
- At `80`, the rendered conversation surface was about 45 message nodes in the tested session
