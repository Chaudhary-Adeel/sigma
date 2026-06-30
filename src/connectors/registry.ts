/**
 * Connector framework.
 *
 * A Connector exposes capabilities to agents as pi ToolDefinitions plus an auth
 * status. Connectors are the *only* source of tools an agent gets: the shell
 * connector provides sandbox-bound read/write/edit/bash, GitHub and Gmail provide
 * their own host-side tools. Roles enable connectors by id, giving least-privilege
 * tool scoping (which also keeps token usage down).
 */
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ConnectorStatus } from "../db/schema.js";
import type { Sandbox } from "../sandbox/docker.js";

/** Tool definitions vary in their param/detail generics; we treat them uniformly. */
export type AnyTool = ToolDefinition<any, any, any>;

export interface ConnectorToolContext {
  /** The task's sandbox, when running inside one (required by the shell connector). */
  sandbox?: Sandbox;
}

export interface ConnectorStatusResult {
  status: ConnectorStatus;
  detail: string;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  /** Inspect configuration/credentials and report health. */
  status(): Promise<ConnectorStatusResult>;
  /** Tools contributed to an agent that has this connector enabled. */
  tools(ctx: ConnectorToolContext): AnyTool[];
  /** Optional interactive login used by `sigma connector login <id>`. */
  login?(): Promise<void>;
}

const _registry = new Map<string, Connector>();

export function registerConnector(c: Connector): void {
  _registry.set(c.id, c);
}

export function getConnectorImpl(id: string): Connector | undefined {
  return _registry.get(id);
}

export function listConnectorImpls(): Connector[] {
  return [..._registry.values()];
}

/** Collect tools from a set of enabled connector ids. Unknown ids are ignored. */
export function collectConnectorTools(ids: string[], ctx: ConnectorToolContext): AnyTool[] {
  const out: AnyTool[] = [];
  for (const id of ids) {
    const impl = _registry.get(id);
    if (impl) out.push(...impl.tools(ctx));
  }
  return out;
}
