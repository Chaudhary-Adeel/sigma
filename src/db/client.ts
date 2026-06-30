/**
 * SQLite connection + schema bootstrap.
 *
 * We avoid a separate migration toolchain: tables are created idempotently with
 * CREATE TABLE IF NOT EXISTS on first open. The shapes mirror src/db/schema.ts.
 */
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { PATHS, ensureHome } from "../config/settings.js";
import * as schema from "./schema.js";

let _db: BetterSQLite3Database<typeof schema> | undefined;
let _raw: Database.Database | undefined;

const DDL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'software',
  spec TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  agent_role TEXT NOT NULL DEFAULT 'coder',
  cron_expr TEXT,
  workspace TEXT,
  last_run_id TEXT,
  last_run_at INTEGER,
  next_run_at INTEGER,
  result TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  model TEXT,
  thinking_level TEXT NOT NULL DEFAULT 'medium',
  tools TEXT NOT NULL DEFAULT '[]',
  connectors TEXT NOT NULL DEFAULT '[]',
  skills TEXT NOT NULL DEFAULT '[]',
  system_prompt TEXT NOT NULL DEFAULT '',
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_auth',
  config TEXT NOT NULL DEFAULT '{}',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'builtin',
  path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_role TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER,
  summary TEXT NOT NULL DEFAULT '',
  logs TEXT NOT NULL DEFAULT '',
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`;

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) {
    ensureHome();
    _raw = new Database(PATHS.db);
    _raw.pragma("journal_mode = WAL");
    _raw.pragma("foreign_keys = ON");
    _raw.exec(DDL);
    _db = drizzle(_raw, { schema });
  }
  return _db;
}

export function getRawDb(): Database.Database {
  getDb();
  return _raw!;
}

export { schema };
