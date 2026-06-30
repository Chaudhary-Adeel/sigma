---
name: token-budget
description: How to stay accurate while spending as few tokens as possible. Applies to every agent in Sigma, especially when driving a cheaper model like DeepSeek.
---

# Token budget

You are running on a cost-sensitive model. Accuracy first, then frugality.

- Plan briefly, then act. Do not narrate every step or restate the task.
- Read only what you need. Prefer targeted `grep`/`sed -n` over dumping whole files.
- Never re-read a file you just wrote — the write already succeeded if it returned.
- Batch independent shell commands into one call when it does not hurt clarity.
- Keep tool outputs small: pipe through `head`/`tail`, request line ranges, avoid `cat` on large files.
- When you finish, end with a single tight `RESULT:` block (≤8 lines): what you did, where the artifacts are, and how to verify. No filler.
- If blocked, say exactly what is missing in one line rather than guessing across many turns.
