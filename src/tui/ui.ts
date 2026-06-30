/**
 * Terminal rendering: ANSI helpers, live agent-event printing, and portal views.
 *
 * Kept dependency-free (no heavy TUI lib) so it runs reliably in any terminal,
 * including non-interactive/CI shells. The four portal views read straight from
 * the domain repositories.
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { listAgents } from "../domain/agents.js";
import { listConnectors } from "../domain/connectors.js";
import { listSkills } from "../domain/skills.js";
import { listTasks } from "../domain/tasks.js";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  dim: wrap("2"),
  bold: wrap("1"),
  cyan: wrap("36"),
  green: wrap("32"),
  yellow: wrap("33"),
  red: wrap("31"),
  magenta: wrap("35"),
};

/** Prints streaming orchestrator events. Returns a stateful printer. */
export function createEventPrinter() {
  let inText = false;
  return (event: AgentSessionEvent) => {
    switch (event.type) {
      case "message_update": {
        const ev = event.assistantMessageEvent;
        if (ev?.type === "text_delta" && ev.delta) {
          if (!inText) {
            process.stdout.write(c.bold(c.cyan("\nSigma› ")));
            inText = true;
          }
          process.stdout.write(ev.delta);
        }
        break;
      }
      case "tool_execution_start":
        inText = false;
        process.stdout.write(c.dim(`\n  · ${event.toolName}…`));
        break;
      case "tool_execution_end":
        process.stdout.write(c.dim(" done"));
        break;
      case "turn_end":
      case "agent_end":
        inText = false;
        process.stdout.write("\n");
        break;
    }
  };
}

const statusColor: Record<string, (s: string) => string> = {
  connected: c.green,
  needs_auth: c.yellow,
  error: c.red,
  disabled: c.dim,
  done: c.green,
  failed: c.red,
  running: c.cyan,
  scheduled: c.magenta,
  pending: c.yellow,
};

function tag(s: string): string {
  return (statusColor[s] ?? ((x: string) => x))(`[${s}]`);
}

export function printTasks(): void {
  const tasks = listTasks();
  console.log(c.bold("\nTASKS"));
  if (!tasks.length) return void console.log(c.dim("  (none)"));
  for (const t of tasks) {
    const sched = t.type === "cron" ? c.dim(` {${t.cronExpr}}`) : "";
    console.log(`  ${c.dim(t.id.slice(0, 8))} ${tag(t.status)} ${c.dim(t.type)}${sched} ${t.title}`);
    if (t.result) console.log(c.dim(`      ${t.result.split("\n")[0].slice(0, 90)}`));
  }
}

export function printAgents(): void {
  console.log(c.bold("\nAGENTS"));
  for (const a of listAgents()) {
    console.log(`  ${c.cyan(a.id)} — ${a.description}`);
    console.log(c.dim(`      connectors: ${a.connectors.join(", ") || "none"} | skills: ${a.skills.join(", ") || "none"}`));
  }
}

export function printConnectors(): void {
  console.log(c.bold("\nCONNECTORS"));
  for (const conn of listConnectors()) {
    console.log(`  ${c.cyan(conn.id)} ${tag(conn.status)} ${c.dim(conn.detail)}`);
  }
}

export function printSkills(): void {
  console.log(c.bold("\nSKILLS"));
  for (const s of listSkills()) {
    const mark = s.enabled ? c.green("on") : c.dim("off");
    console.log(`  ${c.cyan(s.name)} [${mark}] ${c.dim(s.description.slice(0, 70))}`);
  }
}
