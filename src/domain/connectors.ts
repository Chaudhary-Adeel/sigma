/** Connector repository for the Connectors pillar (state + config persistence). */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { connectors, type ConnectorRow, type ConnectorStatus } from "../db/schema.js";

export interface ConnectorState {
  id: string;
  name: string;
  status: ConnectorStatus;
  config: Record<string, unknown>;
  detail: string;
}

function parse(row: ConnectorRow): ConnectorState {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.config);
  } catch {
    /* ignore */
  }
  return { id: row.id, name: row.name, status: row.status, config, detail: row.detail };
}

export function upsertConnector(state: {
  id: string;
  name: string;
  status?: ConnectorStatus;
  config?: Record<string, unknown>;
  detail?: string;
}): void {
  const row = {
    id: state.id,
    name: state.name,
    status: state.status ?? ("needs_auth" as ConnectorStatus),
    config: JSON.stringify(state.config ?? {}),
    detail: state.detail ?? "",
    updatedAt: Math.floor(Date.now() / 1000),
  };
  getDb()
    .insert(connectors)
    .values(row)
    .onConflictDoUpdate({
      target: connectors.id,
      // Preserve the original name on conflict; update everything else.
      set: { status: row.status, config: row.config, detail: row.detail, updatedAt: row.updatedAt },
    })
    .run();
}

export function setConnectorStatus(id: string, status: ConnectorStatus, detail = ""): void {
  getDb()
    .update(connectors)
    .set({ status, detail, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(connectors.id, id))
    .run();
}

export function getConnector(id: string): ConnectorState | undefined {
  const row = getDb().select().from(connectors).where(eq(connectors.id, id)).get();
  return row ? parse(row) : undefined;
}

export function listConnectors(): ConnectorState[] {
  return getDb().select().from(connectors).all().map(parse);
}
