/** Connector bootstrap: register built-ins and sync their status into the DB. */
import { listConnectors, upsertConnector } from "../domain/connectors.js";
import { githubConnector } from "./github.js";
import { gmailConnector } from "./gmail.js";
import { listConnectorImpls, registerConnector } from "./registry.js";
import { shellConnector } from "./shell.js";

let _registered = false;

export function registerBuiltinConnectors(): void {
  if (_registered) return;
  registerConnector(shellConnector);
  registerConnector(githubConnector);
  registerConnector(gmailConnector);
  _registered = true;
}

/** Ensure each connector has a DB row, then refresh live status. */
export async function syncConnectorStatuses(): Promise<void> {
  registerBuiltinConnectors();
  const known = new Set(listConnectors().map((c) => c.id));
  for (const impl of listConnectorImpls()) {
    if (!known.has(impl.id)) {
      upsertConnector({ id: impl.id, name: impl.name });
    }
    const s = await impl.status();
    upsertConnector({ id: impl.id, name: impl.name, status: s.status, detail: s.detail });
  }
}

export { listConnectorImpls, getConnectorImpl, collectConnectorTools } from "./registry.js";
export type { Connector, ConnectorToolContext } from "./registry.js";
