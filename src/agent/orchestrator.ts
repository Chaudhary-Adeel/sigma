/**
 * The Sigma orchestrator: a long-lived pi AgentSession the user chats with.
 *
 * It has no host-bound built-in tools — only the routing tools from
 * tools/index.ts — so its context stays small and it cannot accidentally touch
 * the host. Delegated work happens in sandboxes via the delegate/run_task tools.
 */
import {
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { DEFAULT_MODEL_ID, PATHS } from "../config/settings.js";
import { getAuthStorage, getDefaultModel, getModelRegistry, resolveModel } from "../config/models.js";
import { buildOrchestratorTools } from "./tools/index.js";
import { ORCHESTRATOR_PROMPT } from "./prompts.js";

export interface OrchestratorOptions {
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  onEvent?: (event: AgentSessionEvent) => void;
}

export async function createOrchestrator(opts: OrchestratorOptions = {}): Promise<AgentSession> {
  const model = opts.modelId ? resolveModel(opts.modelId) : getDefaultModel();
  const tools = buildOrchestratorTools();

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: PATHS.agentDir,
    systemPrompt: ORCHESTRATOR_PROMPT,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: opts.thinkingLevel ?? "medium",
    noTools: "all",
    customTools: tools,
    tools: tools.map((t) => t.name),
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    authStorage: getAuthStorage() as AuthStorage,
    modelRegistry: getModelRegistry(),
    agentDir: PATHS.agentDir,
  });

  if (opts.onEvent) session.subscribe(opts.onEvent);
  return session;
}
