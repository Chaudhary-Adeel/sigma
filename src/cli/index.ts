#!/usr/bin/env node
/**
 * `sigma` CLI. With no subcommand it launches the interactive portal; subcommands
 * cover doctor, tasks, connectors, agents and skills for scripting/automation.
 */
import { Command } from "commander";
import { bootstrap, bootstrapSync } from "../bootstrap.js";
import { getConnectorImpl } from "../connectors/index.js";
import { setConnectorStatus } from "../domain/connectors.js";
import { createTask } from "../domain/tasks.js";
import { setSkillEnabled } from "../domain/skills.js";
import { runTask } from "../sandbox/runner.js";
import { doctor } from "./doctor.js";
import { runPortal } from "../tui/app.js";
import { c, printAgents, printConnectors, printSkills, printTasks } from "../tui/ui.js";

const program = new Command();
program.name("sigma").description("Personal AI orchestrator built on the Pi agent harness").version("0.1.0");

program
  .command("chat", { isDefault: true })
  .description("Launch the interactive portal (default)")
  .option("-m, --model <id>", "model id, e.g. deepseek/deepseek-chat")
  .option("-t, --thinking <level>", "thinking level: off|low|medium|high")
  .action(async (o) => {
    await runPortal({ modelId: o.model, thinkingLevel: o.thinking });
  });

program
  .command("doctor")
  .description("Check that the environment is ready")
  .action(async () => {
    const ok = await doctor();
    process.exit(ok ? 0 : 1);
  });

const task = program.command("task").description("Manage tasks");
task
  .command("add")
  .requiredOption("--title <title>")
  .requiredOption("--spec <spec>", "instruction for the agent")
  .option("--type <type>", "software|cron", "software")
  .option("--role <role>", "agent role id", "coder")
  .option("--cron <expr>", "cron expression (type=cron)")
  .action((o) => {
    bootstrapSync();
    const t = createTask({ title: o.title, spec: o.spec, type: o.type, agentRole: o.role, cronExpr: o.cron });
    console.log(c.green(`Created ${t.type} task ${t.id}`));
  });
task.command("list").action(() => {
  bootstrapSync();
  printTasks();
});
task
  .command("run <taskId>")
  .action(async (taskId) => {
    bootstrapSync();
    const r = await runTask(taskId);
    console.log((r.ok ? c.green("✓") : c.red("✗")) + " " + r.result);
  });

const connector = program.command("connector").description("Manage connectors");
connector.command("list").action(async () => {
  await bootstrap();
  printConnectors();
});
connector
  .command("login <id>")
  .description("Run a connector's interactive auth flow")
  .action(async (id) => {
    bootstrapSync();
    const impl = getConnectorImpl(id);
    if (!impl) return console.log(c.red(`Unknown connector "${id}"`));
    if (!impl.login) return console.log(c.yellow(`Connector "${id}" configures via .env (no login flow).`));
    await impl.login();
    const s = await impl.status();
    setConnectorStatus(id, s.status, s.detail);
    console.log(c.green(`${id}: ${s.detail}`));
  });

program.command("agent").description("List agent roles").command("list", { isDefault: true }).action(() => {
  bootstrapSync();
  printAgents();
});

const skill = program.command("skill").description("Manage skills");
skill.command("list", { isDefault: true }).action(() => {
  bootstrapSync();
  printSkills();
});
skill.command("enable <name>").action((name) => {
  bootstrapSync();
  setSkillEnabled(name, true);
  console.log(c.green(`enabled ${name}`));
});
skill.command("disable <name>").action((name) => {
  bootstrapSync();
  setSkillEnabled(name, false);
  console.log(c.green(`disabled ${name}`));
});

program.parseAsync().catch((err) => {
  console.error(c.red(`\nsigma: ${(err as Error).message}`));
  process.exit(1);
});
