/** Seed built-in agent roles. Idempotent (upsert by id). */
import { listAgents, upsertAgent, type AgentDef } from "./agents.js";

const BUILTIN_ROLES: AgentDef[] = [
  {
    id: "coder",
    name: "Coder",
    description: "Writes, runs and verifies software in the sandbox",
    model: null,
    thinkingLevel: "medium",
    tools: [],
    connectors: ["shell"],
    skills: ["software-build", "git-workflow", "token-budget"],
    systemPrompt:
      "Implement the requested software. Make the smallest correct change, run it to prove it works, and report verified results.",
    builtin: true,
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Investigates code/repos and reports findings (read-only)",
    model: null,
    thinkingLevel: "medium",
    tools: [],
    connectors: ["github"],
    skills: ["token-budget"],
    systemPrompt:
      "Investigate and answer precisely using the GitHub tools. Do not modify anything. Cite repo/file/issue references in your RESULT.",
    builtin: true,
  },
  {
    id: "ops",
    name: "Ops",
    description: "Workspace operations: builds, scripts, system tasks, git",
    model: null,
    thinkingLevel: "medium",
    tools: [],
    connectors: ["shell", "github"],
    skills: ["software-build", "git-workflow", "token-budget"],
    systemPrompt:
      "Carry out operational tasks in the sandbox: install tooling, run scripts/builds, manage git. Verify outcomes before reporting.",
    builtin: true,
  },
  {
    id: "gmail-triage",
    name: "Gmail Triage",
    description: "Reads, summarizes and acts on email",
    model: null,
    thinkingLevel: "low",
    tools: [],
    connectors: ["gmail"],
    skills: ["gmail-triage", "token-budget"],
    systemPrompt:
      "Triage email with the Gmail tools. Summarize concisely. Never send unless explicitly instructed; otherwise draft and report the text.",
    builtin: true,
  },
];

export function seedAgents(): void {
  const existing = new Set(listAgents().map((a) => a.id));
  for (const role of BUILTIN_ROLES) {
    if (!existing.has(role.id)) upsertAgent(role);
  }
}
