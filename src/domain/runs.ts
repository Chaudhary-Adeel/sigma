/** Run repository — execution history + token/cost accounting. */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { runs, type RunRow, type RunStatus } from "../db/schema.js";

export interface RunUsage {
  tokensInput?: number;
  tokensOutput?: number;
  tokensCacheRead?: number;
  costUsd?: number;
}

export function startRun(taskId: string, agentRole: string): RunRow {
  const db = getDb();
  const id = randomUUID();
  db.insert(runs).values({ id, taskId, agentRole, status: "running" }).run();
  return getRun(id)!;
}

export function getRun(id: string): RunRow | undefined {
  return getDb().select().from(runs).where(eq(runs.id, id)).get();
}

export function listRunsForTask(taskId: string): RunRow[] {
  return getDb().select().from(runs).where(eq(runs.taskId, taskId)).orderBy(desc(runs.startedAt)).all();
}

export function appendRunLog(id: string, chunk: string, maxBytes = 200_000): void {
  const run = getRun(id);
  if (!run) return;
  let logs = run.logs + chunk;
  if (logs.length > maxBytes) {
    // Keep head + tail with a truncation marker, matching pi's output policy.
    const head = logs.slice(0, maxBytes * 0.3);
    const tail = logs.slice(logs.length - maxBytes * 0.6);
    logs = `${head}\n…[${logs.length - head.length - tail.length} bytes truncated]…\n${tail}`;
  }
  getDb().update(runs).set({ logs }).where(eq(runs.id, id)).run();
}

export function finishRun(
  id: string,
  status: RunStatus,
  opts: { summary?: string; usage?: RunUsage; error?: string } = {},
): void {
  const u = opts.usage ?? {};
  getDb()
    .update(runs)
    .set({
      status,
      finishedAt: Math.floor(Date.now() / 1000),
      summary: opts.summary ?? "",
      error: opts.error ?? null,
      tokensInput: u.tokensInput ?? 0,
      tokensOutput: u.tokensOutput ?? 0,
      tokensCacheRead: u.tokensCacheRead ?? 0,
      costUsd: u.costUsd ?? 0,
    })
    .where(eq(runs.id, id))
    .run();
}
