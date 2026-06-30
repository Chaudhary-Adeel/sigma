/**
 * Offline end-to-end test of the full orchestration loop, with no API key and no
 * Docker. It uses pi's faux provider to script tool-calling turns and the local
 * sandbox backend to actually execute file/bash tools, proving:
 *
 *   orchestrator → delegate → sub-agent (write + bash in sandbox) → RESULT → reply
 *   create_task → run_task → recorded run + artifact
 *
 * Run with:
 *   SIGMA_HOME=<tmp> SIGMA_SANDBOX_BACKEND=local npx tsx test/e2e.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { Context } from "@earendil-works/pi-ai";
import { bootstrapSync } from "../src/bootstrap.js";
import { getAuthStorage, getModelRegistry, setModelOverride } from "../src/config/models.js";
import { PATHS } from "../src/config/settings.js";
import { createOrchestrator } from "../src/agent/orchestrator.js";
import { createTask } from "../src/domain/tasks.js";
import { getRun } from "../src/domain/runs.js";
import { getTask } from "../src/domain/tasks.js";
import { runTask } from "../src/sandbox/runner.js";

/** A scripted tool call (stopReason must be "toolUse" so the agent executes it). */
function call(name: string, args: Record<string, unknown>) {
  return fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
}

/** Context-aware faux brain: behaves as orchestrator or sub-agent per system prompt. */
function brain(ctx: Context) {
  const sp = ctx.systemPrompt ?? "";
  if (sp.includes("orchestrator")) {
    const delegated = ctx.messages.some((m) => m.role === "toolResult");
    if (!delegated) {
      return call("delegate", {
        role: "coder",
        instruction: "Create hello.txt containing 'hi from sigma' and verify with cat.",
      });
    }
    return fauxAssistantMessage("Done — coder created hello.txt and verified it prints 'hi from sigma'.");
  }
  // sub-agent: write → bash(cat) → RESULT
  const turns = ctx.messages.filter((m) => m.role === "assistant").length;
  if (turns === 0) return call("write", { path: "hello.txt", content: "hi from sigma\n" });
  if (turns === 1) return call("bash", { command: "cat hello.txt" });
  return fauxAssistantMessage("RESULT:\n- created hello.txt\n- verified: cat hello.txt -> hi from sigma");
}

function findFile(root: string, name: string): string | undefined {
  if (!existsSync(root)) return undefined;
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry === name) {
      return full;
    }
  }
  return undefined;
}

async function main() {
  assert.equal(process.env.SIGMA_SANDBOX_BACKEND, "local", "run with SIGMA_SANDBOX_BACKEND=local");

  bootstrapSync();

  // Register a faux provider through the ModelRegistry so the session resolves the
  // model AND streams through our scripted brain. createFauxCore gives us the
  // streamSimple handler + response queue.
  const core = createFauxCore({ api: "faux", provider: "faux", models: [{ id: "test", name: "Faux Test" }] });
  core.setResponses(Array.from({ length: 80 }, () => brain));
  getModelRegistry().registerProvider("faux", {
    api: "faux",
    baseUrl: "http://faux.local",
    apiKey: "faux",
    streamSimple: core.streamSimple as never,
    models: [
      {
        id: "test",
        name: "Faux Test",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192,
        maxTokens: 4096,
      },
    ],
  });
  const fauxModel = getModelRegistry().find("faux", "test");
  assert.ok(fauxModel, "faux model should be registered");
  setModelOverride(fauxModel);
  getAuthStorage().setRuntimeApiKey("faux", "faux-test-key");

  // ── Test A: full delegation loop ───────────────────────────────────────────
  console.log("A. orchestrator → delegate → sub-agent …");
  const session = await createOrchestrator({});
  await session.prompt("Create hello.txt with 'hi from sigma' and verify it.");
  const finalText = session.getLastAssistantText() ?? "";
  session.dispose();

  assert.ok(/done/i.test(finalText), `orchestrator should report completion, got: ${finalText}`);
  const delegated = findFile(path.join(PATHS.workspaces, "_delegate"), "hello.txt");
  assert.ok(delegated, "sub-agent should have written hello.txt in a delegate workspace");
  assert.match(readFileSync(delegated!, "utf8"), /hi from sigma/);
  console.log(`   ✓ final reply: "${finalText.trim()}"`);
  console.log(`   ✓ artifact: ${delegated}`);

  // ── Test B: tracked task via runner ────────────────────────────────────────
  console.log("B. create_task → run_task → recorded run …");
  const task = createTask({
    title: "hello file",
    spec: "Create hello.txt with 'hi from sigma' and verify with cat.",
    type: "software",
    agentRole: "coder",
  });
  const result = await runTask(task.id);
  assert.ok(result.ok, "task run should succeed");

  const stored = getTask(task.id)!;
  assert.equal(stored.status, "done", "task should be marked done");
  const artifact = path.join(PATHS.workspaces, task.id, "hello.txt");
  assert.ok(existsSync(artifact), "task artifact should exist in its workspace");
  assert.match(readFileSync(artifact, "utf8"), /hi from sigma/);

  const run = getRun(stored.lastRunId!)!;
  assert.equal(run.status, "done");
  assert.ok(run.summary.includes("RESULT"), "run should capture the RESULT block");
  console.log(`   ✓ task ${task.id.slice(0, 8)} done; run ${run.id.slice(0, 8)} recorded`);
  console.log(`   ✓ artifact: ${artifact}`);
  console.log(`   ✓ tokens(in/out): ${run.tokensInput}/${run.tokensOutput}`);

  getModelRegistry().unregisterProvider("faux");
  console.log("\nALL E2E CHECKS PASSED ✓");
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err);
  process.exit(1);
});
