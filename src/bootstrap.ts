/**
 * One-call initialization: filesystem, DB, seeds, connectors, skills.
 * Safe to call multiple times.
 */
import { ensureHome } from "./config/settings.js";
import { getDb } from "./db/client.js";
import { seedAgents } from "./domain/seed.js";
import { registerBuiltinConnectors, syncConnectorStatuses } from "./connectors/index.js";
import { syncSkills } from "./skills/index.js";

let _booted = false;

/** Synchronous bootstrap: home dir, DB tables, seeds, connector + skill registration. */
export function bootstrapSync(): void {
  if (_booted) return;
  ensureHome();
  getDb(); // creates tables
  seedAgents();
  syncSkills();
  registerBuiltinConnectors();
  _booted = true;
}

/** Async extras: probe live connector status (needs network/Docker). */
export async function bootstrap(): Promise<void> {
  bootstrapSync();
  await syncConnectorStatuses();
}
