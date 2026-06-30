/**
 * Skills pillar.
 *
 * Discovers built-in SKILL.md packs via pi's loader, mirrors them into the DB
 * (preserving the user's enabled/disabled choice), and renders the bodies of a
 * role's enabled skills for inline injection into that agent's system prompt.
 *
 * We embed full bodies (not just name+description) because sub-agents run inside
 * a sandbox and cannot read the host skill files on demand. Roles enable only a
 * couple of skills each, so the token cost stays bounded.
 */
import { readFileSync } from "node:fs";
import { loadSkillsFromDir, type Skill } from "@earendil-works/pi-coding-agent";
import { BUNDLED_SKILLS_DIR } from "../config/settings.js";
import { listSkills, setSkillEnabled, upsertSkill } from "../domain/skills.js";

let _cache: Skill[] | undefined;

export function discoverBuiltinSkills(): Skill[] {
  if (!_cache) {
    const { skills } = loadSkillsFromDir({ dir: BUNDLED_SKILLS_DIR, source: "builtin" });
    _cache = skills;
  }
  return _cache;
}

/** Ensure every discovered skill has a DB row. */
export function syncSkills(): void {
  for (const s of discoverBuiltinSkills()) {
    upsertSkill({
      id: s.name,
      name: s.name,
      description: s.description,
      source: "builtin",
      path: s.filePath,
    });
  }
}

export function setEnabled(name: string, enabled: boolean): void {
  setSkillEnabled(name, enabled);
}

/** Strip YAML frontmatter, returning the markdown body. */
function stripFrontmatter(content: string): string {
  if (content.startsWith("---")) {
    const end = content.indexOf("\n---", 3);
    if (end !== -1) return content.slice(content.indexOf("\n", end + 1) + 1).trim();
  }
  return content.trim();
}

/**
 * Render the enabled skills for a role as a prompt fragment. Only skills that are
 * both in the role's list and enabled globally are included.
 */
export function renderRoleSkills(roleSkillNames: string[]): string {
  if (roleSkillNames.length === 0) return "";
  const enabled = new Set(listSkills().filter((s) => s.enabled).map((s) => s.id));
  const wanted = discoverBuiltinSkills().filter(
    (s) => roleSkillNames.includes(s.name) && enabled.has(s.name),
  );
  if (wanted.length === 0) return "";
  const blocks = wanted.map((s) => {
    const body = stripFrontmatter(readFileSync(s.filePath, "utf8"));
    return `<skill name="${s.name}">\n${body}\n</skill>`;
  });
  return `\n\n## Skills\nApply these when relevant:\n\n${blocks.join("\n\n")}`;
}
