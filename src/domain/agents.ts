/** Agent (role) repository for the Agents pillar. */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { agents, type AgentRow } from "../db/schema.js";

/** A role definition with JSON columns parsed into arrays. */
export interface AgentDef {
  id: string;
  name: string;
  description: string;
  model: string | null;
  thinkingLevel: string;
  tools: string[];
  connectors: string[];
  skills: string[];
  systemPrompt: string;
  builtin: boolean;
}

function parse(row: AgentRow): AgentDef {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    model: row.model,
    thinkingLevel: row.thinkingLevel,
    tools: safeArr(row.tools),
    connectors: safeArr(row.connectors),
    skills: safeArr(row.skills),
    systemPrompt: row.systemPrompt,
    builtin: row.builtin,
  };
}

function safeArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function upsertAgent(def: AgentDef): void {
  const row = {
    id: def.id,
    name: def.name,
    description: def.description,
    model: def.model,
    thinkingLevel: def.thinkingLevel,
    tools: JSON.stringify(def.tools),
    connectors: JSON.stringify(def.connectors),
    skills: JSON.stringify(def.skills),
    systemPrompt: def.systemPrompt,
    builtin: def.builtin,
  };
  getDb().insert(agents).values(row).onConflictDoUpdate({ target: agents.id, set: row }).run();
}

export function getAgent(id: string): AgentDef | undefined {
  const row = getDb().select().from(agents).where(eq(agents.id, id)).get();
  return row ? parse(row) : undefined;
}

export function listAgents(): AgentDef[] {
  return getDb().select().from(agents).all().map(parse);
}

export function deleteAgent(id: string): void {
  getDb().delete(agents).where(eq(agents.id, id)).run();
}
