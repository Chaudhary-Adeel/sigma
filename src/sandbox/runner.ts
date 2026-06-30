/**
 * Task runner: turns a Task row into a sandboxed sub-agent run.
 *
 * Lifecycle: ensure a host workspace dir (bind-mounted into the container) →
 * start a sandbox → run the assigned role's sub-agent on the task spec →
 * record run output/usage → tear the sandbox down.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { PATHS } from "../config/settings.js";
import { getAgent, type AgentDef } from "../domain/agents.js";
import { setTaskStatus, updateTask, getTask } from "../domain/tasks.js";
import { appendRunLog, finishRun, startRun } from "../domain/runs.js";
import { runSubAgent, type SubAgentResult } from "../agent/subagent.js";
import { Sandbox } from "./docker.js";

const FALLBACK_ROLE: AgentDef = {
  id: "coder",
  name: "Coder",
  description: "General software agent",
  model: null,
  thinkingLevel: "medium",
  tools: [],
  connectors: ["shell"],
  skills: ["software-build", "token-budget"],
  systemPrompt: "Build and verify software in the sandbox.",
  builtin: true,
};

export interface RunTaskOptions {
  onLog?: (chunk: string) => void;
  onEvent?: (event: AgentSessionEvent) => void;
  signal?: AbortSignal;
}

export async function runTask(taskId: string, opts: RunTaskOptions = {}): Promise<SubAgentResult> {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const role = getAgent(task.agentRole) ?? FALLBACK_ROLE;

  const workspace = path.join(PATHS.workspaces, task.id);
  if (!existsSync(workspace)) mkdirSync(workspace, { recursive: true });

  const run = startRun(task.id, role.id);
  updateTask(task.id, { status: "running", workspace, lastRunId: run.id });

  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create(task.id.slice(0, 8), workspace);
    const result = await runSubAgent({
      role,
      task: task.spec,
      sandbox,
      signal: opts.signal,
      onLog: (chunk) => {
        appendRunLog(run.id, chunk);
        opts.onLog?.(chunk);
      },
      onEvent: opts.onEvent,
    });

    finishRun(run.id, result.ok ? "done" : "failed", {
      summary: result.result,
      usage: result.usage,
    });
    updateTask(task.id, {
      status: task.type === "cron" ? "scheduled" : result.ok ? "done" : "failed",
      result: result.result,
      lastRunAt: Math.floor(Date.now() / 1000),
    });
    return result;
  } catch (err) {
    const message = (err as Error).message;
    appendRunLog(run.id, `\n[runner error] ${message}\n`);
    finishRun(run.id, "failed", { error: message, summary: `Failed: ${message}` });
    setTaskStatus(task.id, task.type === "cron" ? "scheduled" : "failed");
    throw err;
  } finally {
    await sandbox?.destroy();
  }
}
