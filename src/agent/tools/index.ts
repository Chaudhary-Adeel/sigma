/**
 * Orchestrator tools.
 *
 * Deliberately small and high-signal so a cheaper model routes reliably:
 *  - delegate     → one-shot specialist work in an ephemeral sandbox
 *  - create_task  → register a tracked software/cron task
 *  - run_task     → execute a tracked task now (sandboxed)
 *  - list_tasks   → tasks + last result
 *  - overview     → agents, connectors, skills, counts
 *  - toggle_skill → enable/disable a skill
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { PATHS } from "../../config/settings.js";
import { listConnectors } from "../../domain/connectors.js";
import { getAgent, listAgents } from "../../domain/agents.js";
import { listSkills, setSkillEnabled } from "../../domain/skills.js";
import { createTask, getTask, listTasks } from "../../domain/tasks.js";
import { scheduleTask } from "../../sandbox/scheduler.js";
import { runTask } from "../../sandbox/runner.js";
import { createSandbox } from "../../sandbox/index.js";
import type { SandboxBackend } from "../../sandbox/types.js";
import { runSubAgent } from "../subagent.js";
import type { AnyTool } from "../../connectors/registry.js";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }], details: {} };
}

const delegate = defineTool({
  name: "delegate",
  label: "Delegate",
  description:
    "Run a one-shot specialist sub-agent in a fresh sandbox and get its RESULT. Use for work needing files/shell/repo/email. Sub-agents are stateless.",
  parameters: Type.Object({
    role: Type.String({ description: "Agent role id (see overview), e.g. coder/researcher/ops/gmail-triage" }),
    instruction: Type.String({ description: "Complete instruction: goal, constraints, how to verify" }),
  }),
  execute: async (_id, params, signal) => {
    const role = getAgent(params.role);
    if (!role) {
      return text(`Unknown role "${params.role}". Available: ${listAgents().map((a) => a.id).join(", ")}`);
    }
    const ws = path.join(PATHS.workspaces, "_delegate", randomUUID());
    mkdirSync(ws, { recursive: true });
    let sandbox: SandboxBackend | undefined;
    try {
      sandbox = await createSandbox("delegate", ws);
      const r = await runSubAgent({ role, task: params.instruction, sandbox, signal });
      return text(r.result);
    } catch (err) {
      return text(`Delegation failed: ${(err as Error).message}`);
    } finally {
      await sandbox?.destroy();
    }
  },
});

const createTaskTool = defineTool({
  name: "create_task",
  label: "Create task",
  description:
    'Register a tracked task. type "software" = a build/run job; type "cron" = recurring (requires cron expression). Does not run it unless you then call run_task.',
  parameters: Type.Object({
    title: Type.String(),
    spec: Type.String({ description: "Full instruction for the assigned agent" }),
    type: Type.Optional(Type.Union([Type.Literal("software"), Type.Literal("cron")])),
    role: Type.Optional(Type.String({ description: "Agent role id (default coder)" })),
    cron: Type.Optional(Type.String({ description: "Cron expression, required when type=cron" })),
  }),
  execute: async (_id, params) => {
    const type = params.type ?? "software";
    if (type === "cron" && !params.cron) return text("cron tasks require a cron expression");
    const task = createTask({
      title: params.title,
      spec: params.spec,
      type,
      agentRole: params.role ?? "coder",
      cronExpr: params.cron ?? null,
    });
    if (type === "cron" && params.cron) {
      try {
        scheduleTask(task.id, params.cron);
      } catch (err) {
        return text(`Task ${task.id} created but scheduling failed: ${(err as Error).message}`);
      }
      return text(`Created cron task ${task.id} ("${task.title}") on schedule "${params.cron}".`);
    }
    return text(`Created task ${task.id} ("${task.title}"). Run it with run_task.`);
  },
});

const runTaskTool = defineTool({
  name: "run_task",
  label: "Run task",
  description: "Execute a tracked task now in a sandbox and return its RESULT.",
  parameters: Type.Object({ taskId: Type.String() }),
  execute: async (_id, params, signal) => {
    if (!getTask(params.taskId)) return text(`Task ${params.taskId} not found`);
    try {
      const r = await runTask(params.taskId, { signal: signal ?? undefined });
      return text(r.result);
    } catch (err) {
      return text(`Task run failed: ${(err as Error).message}`);
    }
  },
});

const listTasksTool = defineTool({
  name: "list_tasks",
  label: "List tasks",
  description: "List tracked tasks with status and last result.",
  parameters: Type.Object({}),
  execute: async () => {
    const rows = listTasks().map((t) => {
      const result = t.result ? ` — ${t.result.split("\n")[0].slice(0, 80)}` : "";
      const sched = t.type === "cron" ? ` [${t.cronExpr}]` : "";
      return `${t.id.slice(0, 8)} [${t.type}/${t.status}]${sched} ${t.title}${result}`;
    });
    return text(rows.join("\n") || "(no tasks)");
  },
});

const overview = defineTool({
  name: "overview",
  label: "Overview",
  description: "Summarize agents, connectors, and skills available right now.",
  parameters: Type.Object({}),
  execute: async () => {
    const agents = listAgents().map((a) => `  ${a.id}: ${a.description} (connectors: ${a.connectors.join(",") || "none"})`);
    const conns = listConnectors().map((c) => `  ${c.id} [${c.status}] ${c.detail}`);
    const sk = listSkills().map((s) => `  ${s.name} [${s.enabled ? "on" : "off"}]: ${s.description.slice(0, 60)}`);
    return text(
      `AGENTS:\n${agents.join("\n") || "  (none)"}\n\nCONNECTORS:\n${conns.join("\n") || "  (none)"}\n\nSKILLS:\n${sk.join("\n") || "  (none)"}`,
    );
  },
});

const toggleSkill = defineTool({
  name: "toggle_skill",
  label: "Toggle skill",
  description: "Enable or disable a skill by name.",
  parameters: Type.Object({ name: Type.String(), enabled: Type.Boolean() }),
  execute: async (_id, params) => {
    setSkillEnabled(params.name, params.enabled);
    return text(`Skill "${params.name}" ${params.enabled ? "enabled" : "disabled"}.`);
  },
});

export function buildOrchestratorTools(): AnyTool[] {
  return [delegate, createTaskTool, runTaskTool, listTasksTool, overview, toggleSkill];
}
