/** Task repository — CRUD + status transitions for the Tasks pillar. */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { tasks, type TaskRow, type TaskStatus, type TaskType } from "../db/schema.js";

export interface CreateTaskInput {
  title: string;
  spec: string;
  type?: TaskType;
  agentRole?: string;
  cronExpr?: string | null;
}

export function createTask(input: CreateTaskInput): TaskRow {
  const db = getDb();
  const id = randomUUID();
  const type = input.type ?? "software";
  const status: TaskStatus = type === "cron" ? "scheduled" : "pending";
  db.insert(tasks)
    .values({
      id,
      title: input.title,
      spec: input.spec,
      type,
      status,
      agentRole: input.agentRole ?? "coder",
      cronExpr: input.cronExpr ?? null,
    })
    .run();
  return getTask(id)!;
}

export function getTask(id: string): TaskRow | undefined {
  return getDb().select().from(tasks).where(eq(tasks.id, id)).get();
}

export function listTasks(): TaskRow[] {
  return getDb().select().from(tasks).orderBy(desc(tasks.createdAt)).all();
}

export function listTasksByStatus(status: TaskStatus): TaskRow[] {
  return getDb().select().from(tasks).where(eq(tasks.status, status)).all();
}

export function listCronTasks(): TaskRow[] {
  return getDb().select().from(tasks).where(eq(tasks.type, "cron")).all();
}

export function updateTask(id: string, patch: Partial<TaskRow>): void {
  getDb()
    .update(tasks)
    .set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(tasks.id, id))
    .run();
}

export function setTaskStatus(id: string, status: TaskStatus): void {
  updateTask(id, { status });
}

export function deleteTask(id: string): void {
  getDb().delete(tasks).where(eq(tasks.id, id)).run();
}
