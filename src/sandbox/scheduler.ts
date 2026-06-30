/**
 * Cron scheduler for recurring tasks.
 *
 * Registers node-cron schedules for every cron-type Task and runs them in their
 * own sandbox on each fire. A single process-wide scheduler keeps a handle per
 * task so schedules can be added/removed as tasks change.
 */
import cron, { type ScheduledTask } from "node-cron";
import { listCronTasks } from "../domain/tasks.js";
import { runTask } from "./runner.js";

const _jobs = new Map<string, ScheduledTask>();

export type CronNotifier = (taskId: string, summary: string, ok: boolean) => void;

let _notifier: CronNotifier | undefined;
export function setCronNotifier(fn: CronNotifier): void {
  _notifier = fn;
}

export function scheduleTask(taskId: string, cronExpr: string): void {
  if (!cron.validate(cronExpr)) throw new Error(`Invalid cron expression: ${cronExpr}`);
  unscheduleTask(taskId);
  const job = cron.schedule(cronExpr, async () => {
    try {
      const result = await runTask(taskId);
      _notifier?.(taskId, result.result, result.ok);
    } catch (err) {
      _notifier?.(taskId, `Cron run failed: ${(err as Error).message}`, false);
    }
  });
  _jobs.set(taskId, job);
}

export function unscheduleTask(taskId: string): void {
  const job = _jobs.get(taskId);
  if (job) {
    job.stop();
    _jobs.delete(taskId);
  }
}

/** (Re)load all cron tasks from the DB and schedule them. */
export function startScheduler(): number {
  for (const job of _jobs.values()) job.stop();
  _jobs.clear();
  let n = 0;
  for (const task of listCronTasks()) {
    if (task.cronExpr && task.status !== "paused") {
      try {
        scheduleTask(task.id, task.cronExpr);
        n++;
      } catch {
        /* skip invalid */
      }
    }
  }
  return n;
}

export function scheduledCount(): number {
  return _jobs.size;
}
