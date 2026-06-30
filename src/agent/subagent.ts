/**
 * Sub-agent runtime.
 *
 * Builds a role-scoped pi AgentSession whose tools come exclusively from the
 * role's enabled connectors (shell tools are sandbox-bound), runs a single
 * delegated instruction to completion, and returns a compact result + usage.
 */
import {
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { PATHS } from "../config/settings.js";
import { getAuthStorage, getDefaultModel, getModelRegistry, resolveModel } from "../config/models.js";
import { collectConnectorTools } from "../connectors/registry.js";
import type { AgentDef } from "../domain/agents.js";
import type { RunUsage } from "../domain/runs.js";
import type { SandboxBackend } from "../sandbox/types.js";
import { extractResult, looksSuccessful, statsToUsage } from "./context.js";
import { buildRolePrompt } from "./prompts.js";

export interface SubAgentRunOptions {
  role: AgentDef;
  /** The delegated instruction. */
  task: string;
  /** Sandbox the shell connector binds to (required for shell-using roles). */
  sandbox?: SandboxBackend;
  onEvent?: (event: AgentSessionEvent) => void;
  /** Streamed combined text/log output (for run logs). */
  onLog?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface SubAgentResult {
  ok: boolean;
  /** Compact RESULT block for the orchestrator. */
  result: string;
  /** Full final assistant message. */
  fullText: string;
  usage: RunUsage;
}

export async function runSubAgent(opts: SubAgentRunOptions): Promise<SubAgentResult> {
  const { role } = opts;
  const model = role.model ? resolveModel(role.model) : getDefaultModel();

  const tools = collectConnectorTools(role.connectors, { sandbox: opts.sandbox });
  const systemPrompt = buildRolePrompt(role, opts.sandbox?.workdir ?? "/work");

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: PATHS.agentDir,
    systemPrompt,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: role.thinkingLevel as ThinkingLevel,
    // Disable pi's host-bound built-in tools; our sandbox tools come via customTools.
    noTools: "builtin",
    customTools: tools,
    tools: tools.map((t) => t.name),
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    authStorage: getAuthStorage() as AuthStorage,
    modelRegistry: getModelRegistry(),
    agentDir: PATHS.agentDir,
  });

  const unsub = session.subscribe((event) => {
    opts.onEvent?.(event);
    if (opts.onLog && event.type === "message_update") {
      const ev = event.assistantMessageEvent;
      if (ev?.type === "text_delta" && ev.delta) opts.onLog(ev.delta);
    }
  });

  try {
    await session.prompt(opts.task);
    const fullText = session.getLastAssistantText() ?? "";
    const usage = statsToUsage(session.getSessionStats());
    return {
      ok: looksSuccessful(fullText),
      result: extractResult(fullText),
      fullText,
      usage,
    };
  } finally {
    unsub();
    session.dispose();
  }
}
