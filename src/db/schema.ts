/**
 * SQLite schema for Sigma's four pillars + run history.
 *
 * Drizzle table definitions. JSON-shaped columns are stored as TEXT and parsed
 * by the repositories in src/domain.
 */
import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type TaskType = "software" | "cron";
export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "scheduled"
  | "paused";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").$type<TaskType>().notNull().default("software"),
  spec: text("spec").notNull(),
  status: text("status").$type<TaskStatus>().notNull().default("pending"),
  agentRole: text("agent_role").notNull().default("coder"),
  cronExpr: text("cron_expr"),
  workspace: text("workspace"),
  lastRunId: text("last_run_id"),
  lastRunAt: integer("last_run_at"),
  nextRunAt: integer("next_run_at"),
  result: text("result"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const agents = sqliteTable("agents", {
  /** Role id, e.g. "coder". */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** "provider/model" or null to use the global default. */
  model: text("model"),
  thinkingLevel: text("thinking_level").notNull().default("medium"),
  /** JSON array of core tool names (read/write/edit/bash). */
  tools: text("tools").notNull().default("[]"),
  /** JSON array of connector ids enabled for this role. */
  connectors: text("connectors").notNull().default("[]"),
  /** JSON array of skill names enabled for this role. */
  skills: text("skills").notNull().default("[]"),
  systemPrompt: text("system_prompt").notNull().default(""),
  builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export type ConnectorStatus = "connected" | "needs_auth" | "disabled" | "error";

export const connectors = sqliteTable("connectors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").$type<ConnectorStatus>().notNull().default("needs_auth"),
  /** JSON config blob (connector-specific). */
  config: text("config").notNull().default("{}"),
  detail: text("detail").notNull().default(""),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const skills = sqliteTable("skills", {
  /** Skill name (matches SKILL.md frontmatter name). */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  source: text("source").notNull().default("builtin"),
  path: text("path").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export type RunStatus = "running" | "done" | "failed";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  agentRole: text("agent_role").notNull().default(""),
  status: text("status").$type<RunStatus>().notNull().default("running"),
  startedAt: integer("started_at").notNull().default(sql`(unixepoch())`),
  finishedAt: integer("finished_at"),
  summary: text("summary").notNull().default(""),
  logs: text("logs").notNull().default(""),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  error: text("error"),
});

export type TaskRow = typeof tasks.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type ConnectorRow = typeof connectors.$inferSelect;
export type SkillRow = typeof skills.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
