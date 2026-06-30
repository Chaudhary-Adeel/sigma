# Sigma

A personal AI orchestration system — a "Jarvis"-style assistant you talk to in your
terminal. One **orchestrator** agent manages a portal with four pillars —
**Tasks, Agents, Connectors, Skills** — and delegates real work to specialized
sub-agents that run in **Docker sandboxes**.

Built on the [**Pi agent harness**](https://github.com/earendil-works/pi)
(`pi-ai` + `pi-agent-core` + `pi-coding-agent`) and tuned for **token efficiency**
so it runs well on cheaper models like **DeepSeek** (bring-your-own-key; any
Pi-supported provider works).

```
  ╓─ Sigma ─ personal AI orchestrator
  ╙─ model: deepseek/deepseek-chat  ·  type /help for commands

you› build a python script that prints prime numbers up to 100 and run it
Sigma›  · delegate… done
Done. The coder built primes.py in the sandbox and ran it — it printed the 25
primes from 2 to 97. Artifact: /work/primes.py.
```

## How it works

- **Orchestrator (Sigma).** A long-lived agent you chat with. It has *no* hands-on
  tools — only routing tools (`delegate`, `create_task`, `run_task`, `list_tasks`,
  `overview`, `toggle_skill`). It plans, delegates, tracks, and reports. This keeps
  its context small and prevents it from touching your host.
- **Agents (roles).** `coder`, `researcher`, `ops`, `gmail-triage` (editable, and you
  can add your own). Each role gets a minimal, least-privilege toolset drawn from its
  enabled connectors plus a terse role prompt and a couple of skills.
- **Tasks.** `software` tasks build/run something; `cron` tasks run on a schedule
  (`node-cron`). Each run executes in its own Docker sandbox and is recorded with
  token/cost accounting.
- **Connectors.** Pluggable capabilities exposed to agents as tools:
  - **Filesystem & Shell** — `read`/`write`/`edit`/`bash`, bound to the task's
    sandbox container (not your host).
  - **GitHub** — repos, issues, PRs, file reads (via `GITHUB_TOKEN`).
  - **Gmail** — read/search/send (Google OAuth).
- **Skills.** Curated `SKILL.md` packs (`software-build`, `git-workflow`,
  `gmail-triage`, `token-budget`) injected into the relevant role's prompt.

### Why Docker is required

Pi has no built-in permission system, so **the container is the trust boundary**:
sub-agents run arbitrary code only inside a per-task sandbox with a bind-mounted
workspace, resource limits, and an optional network cutoff. Nothing runs on your
host.

### Token efficiency

Designed to get strong results from a cheap model:

- Orchestrator and roles use **short, rule-based prompts** and a **small, high-signal
  toolset** (least privilege per role).
- A **stable prompt prefix** (system prompt + tool schemas first) maximizes DeepSeek's
  automatic context caching.
- Sub-agents return a compact **`RESULT:` block**; only that — not the whole transcript
  — flows back to the orchestrator.
- Large tool/log outputs are head/tail-truncated; per-run tokens and cost are recorded.

## Quick start

```bash
npm install
npm run build

cp .env.example .env          # then add DEEPSEEK_API_KEY (and GITHUB_TOKEN etc.)
docker pull node:22-bookworm-slim   # the default sandbox image

node dist/cli/index.js doctor # verify model, Docker, image, connectors
node dist/cli/index.js        # launch the interactive portal
```

Requirements: Node ≥ 20, a running Docker daemon, and an API key for your chosen model.

## CLI

```
sigma                       # launch the interactive portal (default)
sigma doctor                # environment checks
sigma task add --title T --spec "…" [--type software|cron] [--role coder] [--cron "*/5 * * * *"]
sigma task list
sigma task run <taskId>
sigma connector list
sigma connector login gmail # interactive OAuth flow
sigma agent list
sigma skill list | skill enable <name> | skill disable <name>
```

Inside the portal, type to chat with Sigma, or use slash-commands: `/tasks`,
`/agents`, `/connectors`, `/skills`, `/run <id>`, `/logs <id>`, `/help`, `/quit`.

## Configuration

All runtime state lives under `~/.sigma` (override with `SIGMA_HOME`): the SQLite
database, resolved auth, per-task workspaces, and a user-editable `models.json`
(seeded from [`config/models.json`](config/models.json) — add providers/models there).

Key environment variables (see [`.env.example`](.env.example)):

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Default model auth |
| `SIGMA_MODEL` | Default model id, e.g. `deepseek/deepseek-chat` |
| `SIGMA_SANDBOX_IMAGE` | Sandbox base image (default `node:22-bookworm-slim`) |
| `SIGMA_SANDBOX_NO_NETWORK` | Cut container network access |
| `GITHUB_TOKEN` | GitHub connector |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | Gmail connector (Desktop OAuth client) |

### Gmail setup

Create an OAuth 2.0 **Desktop app** client in Google Cloud Console, enable the Gmail
API, put the client id/secret in `.env`, then run `sigma connector login gmail`. Until
configured, the connector reports `needs_auth` rather than failing.

## Architecture

```
src/
  config/      settings + DeepSeek model registry/auth
  db/          SQLite schema + client (drizzle + better-sqlite3)
  domain/      repositories: tasks, agents, connectors, skills, runs (+ seeds)
  agent/       orchestrator, sub-agent runtime, routing tools, prompts, context mgmt
  sandbox/     Docker lifecycle + pluggable operations, task runner, cron scheduler
  connectors/  registry + shell / github / gmail
  skills/      SKILL.md discovery + role-prompt rendering
  tui/         interactive portal + rendering
  cli/         `sigma` entrypoint + doctor
skills/        built-in SKILL.md packs
config/        bundled models.json template
```

## Status & limitations

- Running tasks requires a reachable Docker daemon **that can obtain the sandbox image**
  (`docker pull node:22-bookworm-slim`, or point `SIGMA_SANDBOX_IMAGE` at a local image).
- Live model calls require a valid API key for the configured provider.
- The portal is terminal-native (readline); a full-screen TUI and additional connectors
  are natural next steps.
