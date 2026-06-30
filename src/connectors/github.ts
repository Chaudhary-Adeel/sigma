/**
 * GitHub connector (live via Octokit).
 *
 * Host-side tools (not sandboxed) for repos/issues/PRs/files. Authenticated with
 * GITHUB_TOKEN. Tool outputs are kept compact to conserve the agent's context.
 */
import { Octokit } from "@octokit/rest";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { ENV } from "../config/settings.js";
import type { Connector } from "./registry.js";

function octokit(): Octokit {
  if (!ENV.githubToken) throw new Error("GitHub not configured: set GITHUB_TOKEN");
  return new Octokit({ auth: ENV.githubToken });
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }], details: {} };
}

const listRepos = defineTool({
  name: "github_list_repos",
  label: "GitHub: list repos",
  description: "List repositories accessible to the authenticated user.",
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ description: "Max repos (default 30)" })),
  }),
  execute: async (_id, params) => {
    const res = await octokit().rest.repos.listForAuthenticatedUser({
      per_page: Math.min(params.limit ?? 30, 100),
      sort: "updated",
    });
    const lines = res.data.map((r) => `${r.full_name}${r.private ? " (private)" : ""} — ${r.description ?? ""}`);
    return text(lines.join("\n") || "(no repos)");
  },
});

const listIssues = defineTool({
  name: "github_list_issues",
  label: "GitHub: list issues",
  description: "List issues for a repo. owner/repo required.",
  parameters: Type.Object({
    owner: Type.String(),
    repo: Type.String(),
    state: Type.Optional(Type.Union([Type.Literal("open"), Type.Literal("closed"), Type.Literal("all")])),
    limit: Type.Optional(Type.Number()),
  }),
  execute: async (_id, params) => {
    const res = await octokit().rest.issues.listForRepo({
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      per_page: Math.min(params.limit ?? 30, 100),
    });
    const lines = res.data
      .filter((i) => !i.pull_request)
      .map((i) => `#${i.number} [${i.state}] ${i.title}`);
    return text(lines.join("\n") || "(no issues)");
  },
});

const getIssue = defineTool({
  name: "github_get_issue",
  label: "GitHub: get issue",
  description: "Get a single issue with body and metadata.",
  parameters: Type.Object({ owner: Type.String(), repo: Type.String(), number: Type.Number() }),
  execute: async (_id, params) => {
    const res = await octokit().rest.issues.get({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.number,
    });
    const i = res.data;
    return text(`#${i.number} [${i.state}] ${i.title}\nby ${i.user?.login}\n\n${i.body ?? "(no body)"}`);
  },
});

const createIssue = defineTool({
  name: "github_create_issue",
  label: "GitHub: create issue",
  description: "Open a new issue.",
  parameters: Type.Object({
    owner: Type.String(),
    repo: Type.String(),
    title: Type.String(),
    body: Type.Optional(Type.String()),
  }),
  execute: async (_id, params) => {
    const res = await octokit().rest.issues.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
    });
    return text(`Created issue #${res.data.number}: ${res.data.html_url}`);
  },
});

const commentIssue = defineTool({
  name: "github_comment_issue",
  label: "GitHub: comment on issue",
  description: "Add a comment to an issue or PR.",
  parameters: Type.Object({
    owner: Type.String(),
    repo: Type.String(),
    number: Type.Number(),
    body: Type.String(),
  }),
  execute: async (_id, params) => {
    const res = await octokit().rest.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.number,
      body: params.body,
    });
    return text(`Commented: ${res.data.html_url}`);
  },
});

const listPrs = defineTool({
  name: "github_list_prs",
  label: "GitHub: list PRs",
  description: "List pull requests for a repo.",
  parameters: Type.Object({
    owner: Type.String(),
    repo: Type.String(),
    state: Type.Optional(Type.Union([Type.Literal("open"), Type.Literal("closed"), Type.Literal("all")])),
    limit: Type.Optional(Type.Number()),
  }),
  execute: async (_id, params) => {
    const res = await octokit().rest.pulls.list({
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      per_page: Math.min(params.limit ?? 30, 100),
    });
    const lines = res.data.map((p) => `#${p.number} [${p.state}] ${p.title} (${p.head.ref}→${p.base.ref})`);
    return text(lines.join("\n") || "(no PRs)");
  },
});

const getFile = defineTool({
  name: "github_get_file",
  label: "GitHub: read file",
  description: "Read a file's contents from a repo at an optional ref.",
  parameters: Type.Object({
    owner: Type.String(),
    repo: Type.String(),
    path: Type.String(),
    ref: Type.Optional(Type.String()),
  }),
  execute: async (_id, params) => {
    const res = await octokit().rest.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      ref: params.ref,
    });
    const data = res.data as { content?: string; encoding?: string };
    if (!data.content) return text("(not a file or empty)");
    const buf = Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64");
    return text(buf.toString("utf8"));
  },
});

export const githubConnector: Connector = {
  id: "github",
  name: "GitHub",
  description: "Repos, issues, PRs and file access via the GitHub API.",

  async status() {
    if (!ENV.githubToken) return { status: "needs_auth", detail: "Set GITHUB_TOKEN in .env" };
    try {
      const me = await octokit().rest.users.getAuthenticated();
      return { status: "connected", detail: `Authenticated as ${me.data.login}` };
    } catch (err) {
      return { status: "error", detail: (err as Error).message };
    }
  },

  tools() {
    return [listRepos, listIssues, getIssue, createIssue, commentIssue, listPrs, getFile];
  },
};
