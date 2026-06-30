---
name: git-workflow
description: Safe git usage for tasks that version or push code. Covers branching, committing, and pushing via the configured credentials.
---

# Git workflow

- Check state first: `git status` and `git branch --show-current`.
- Never commit on the default branch directly. Create or switch to a feature branch.
- Stage deliberately (`git add <paths>`), not blindly with `git add -A`, unless the whole tree is the change.
- Commit messages: a concise imperative subject line, then a short body if needed.
- Only push when the task asks for it. Use `git push -u origin <branch>`.
- If a remote/token is required, the GitHub connector or `GITHUB_TOKEN` provides it; do not invent credentials.
- Report the branch name and commit hash in your RESULT.
