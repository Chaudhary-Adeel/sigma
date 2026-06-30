/**
 * Interactive portal: chat with the Sigma orchestrator plus slash-commands for
 * the four pillars. Cron tasks run in the background while you chat.
 *
 * Uses node:readline rather than a full-screen TUI for reliability in any shell.
 */
import readline from "node:readline";
import { bootstrap } from "../bootstrap.js";
import { defaultModelHasAuth } from "../config/models.js";
import { DEFAULT_MODEL_ID } from "../config/settings.js";
import { listRunsForTask } from "../domain/runs.js";
import { getTask, listTasks } from "../domain/tasks.js";
import { runTask } from "../sandbox/runner.js";
import { setCronNotifier, startScheduler } from "../sandbox/scheduler.js";
import { createOrchestrator } from "../agent/orchestrator.js";
import {
  c,
  createEventPrinter,
  printAgents,
  printConnectors,
  printSkills,
  printTasks,
} from "./ui.js";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

const HELP = `
${c.bold("Commands")}
  (type anything)      talk to Sigma — it delegates and reports
  /tasks               list tracked tasks
  /agents              list agent roles
  /connectors          list connectors + status
  /skills              list skills
  /run <taskId>        run a tracked task now
  /logs <taskId>       show the last run's log tail
  /help                this help
  /quit                exit
`;

export async function runPortal(opts: { modelId?: string; thinkingLevel?: any } = {}): Promise<void> {
  await bootstrap();

  console.log(c.bold(c.cyan("\n  ╓─ Sigma ─ personal AI orchestrator")));
  console.log(c.dim(`  ╙─ model: ${opts.modelId ?? DEFAULT_MODEL_ID}  ·  type /help for commands\n`));
  printConnectors();

  if (!(await defaultModelHasAuth())) {
    console.log(c.yellow("\n  ⚠ No API key for the default model. Set DEEPSEEK_API_KEY in .env to chat.\n"));
  }

  const scheduled = startScheduler();
  if (scheduled > 0) console.log(c.dim(`\n  ${scheduled} cron task(s) scheduled.`));

  const session: AgentSession = await createOrchestrator({
    modelId: opts.modelId,
    thinkingLevel: opts.thinkingLevel,
    onEvent: createEventPrinter(),
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.green("\nyou› "),
  });

  setCronNotifier((id, summary, ok) => {
    const mark = ok ? c.green("⏰ cron") : c.red("⏰ cron");
    process.stdout.write(`\n${mark} ${id.slice(0, 8)}: ${summary.split("\n")[0]}\n`);
    rl.prompt();
  });

  const handleSlash = async (line: string): Promise<boolean> => {
    const [cmd, ...rest] = line.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "help": console.log(HELP); return true;
      case "tasks": printTasks(); return true;
      case "agents": printAgents(); return true;
      case "connectors": printConnectors(); return true;
      case "skills": printSkills(); return true;
      case "run": {
        if (!arg) { console.log(c.red("usage: /run <taskId>")); return true; }
        const t = resolveTaskId(arg);
        if (!t) { console.log(c.red(`task ${arg} not found`)); return true; }
        console.log(c.dim(`running ${t}…`));
        try {
          const r = await runTask(t);
          console.log((r.ok ? c.green("✓") : c.red("✗")) + " " + r.result);
        } catch (e) {
          console.log(c.red(`run failed: ${(e as Error).message}`));
        }
        return true;
      }
      case "logs": {
        const t = resolveTaskId(arg);
        if (!t) { console.log(c.red("usage: /logs <taskId>")); return true; }
        const runs = listRunsForTask(t);
        if (!runs.length) { console.log(c.dim("(no runs)")); return true; }
        console.log(c.dim(runs[0].logs.slice(-2000) || "(empty)"));
        return true;
      }
      case "quit":
      case "exit":
        rl.close();
        return true;
      default:
        console.log(c.red(`unknown command /${cmd} — try /help`));
        return true;
    }
  };

  rl.prompt();
  rl.on("line", async (raw) => {
    const line = raw.trim();
    if (!line) return rl.prompt();
    if (line.startsWith("/")) {
      await handleSlash(line);
      return rl.prompt();
    }
    rl.pause();
    try {
      await session.prompt(line);
    } catch (err) {
      console.log(c.red(`\nerror: ${(err as Error).message}`));
    }
    rl.resume();
    rl.prompt();
  });

  await new Promise<void>((resolve) => {
    rl.on("close", () => {
      console.log(c.dim("\nbye."));
      session.dispose();
      resolve();
    });
  });
}

/** Accept a full id or an 8-char prefix shown in listings. */
function resolveTaskId(arg: string): string | undefined {
  if (getTask(arg)) return arg;
  return listTasks().find((t) => t.id.startsWith(arg))?.id;
}
