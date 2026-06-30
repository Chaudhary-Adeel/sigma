/** Skill repository for the Skills pillar (enable/disable + metadata). */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { skills, type SkillRow } from "../db/schema.js";

export interface SkillState {
  id: string;
  name: string;
  description: string;
  source: string;
  path: string;
  enabled: boolean;
}

function parse(row: SkillRow): SkillState {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source,
    path: row.path,
    enabled: row.enabled,
  };
}

export function upsertSkill(s: {
  id: string;
  name: string;
  description: string;
  source: string;
  path: string;
  enabled?: boolean;
}): void {
  const row = {
    id: s.id,
    name: s.name,
    description: s.description,
    source: s.source,
    path: s.path,
    enabled: s.enabled ?? true,
  };
  getDb()
    .insert(skills)
    .values(row)
    // Keep the user's enabled choice on re-discovery; refresh description/path.
    .onConflictDoUpdate({
      target: skills.id,
      set: { name: row.name, description: row.description, path: row.path, source: row.source },
    })
    .run();
}

export function setSkillEnabled(id: string, enabled: boolean): void {
  getDb().update(skills).set({ enabled }).where(eq(skills.id, id)).run();
}

export function getSkill(id: string): SkillState | undefined {
  const row = getDb().select().from(skills).where(eq(skills.id, id)).get();
  return row ? parse(row) : undefined;
}

export function listSkills(): SkillState[] {
  return getDb().select().from(skills).all().map(parse);
}

export function listEnabledSkills(): SkillState[] {
  return listSkills().filter((s) => s.enabled);
}
