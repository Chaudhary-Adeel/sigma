/**
 * Central configuration: filesystem paths, environment, and sandbox settings.
 *
 * Sigma keeps all mutable state under SIGMA_HOME (default ~/.sigma): the SQLite
 * database, resolved auth, per-task workspaces, and a user-editable models.json.
 * Bundled, read-only assets (the default models.json template and built-in skill
 * packs) live in the package directory.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

// Load .env from the current working directory (best effort; ignored if absent).
loadDotenv();

/** Package root — two levels up from src/config (and dist/config) is the repo root. */
export const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Bundled, read-only assets shipped with the package. */
export const BUNDLED_MODELS_JSON = path.join(PACKAGE_ROOT, "config", "models.json");
export const BUNDLED_SKILLS_DIR = path.join(PACKAGE_ROOT, "skills");

/** Mutable home directory for all runtime state. */
export const SIGMA_HOME = process.env.SIGMA_HOME
  ? path.resolve(process.env.SIGMA_HOME)
  : path.join(homedir(), ".sigma");

export const PATHS = {
  home: SIGMA_HOME,
  db: path.join(SIGMA_HOME, "sigma.sqlite"),
  auth: path.join(SIGMA_HOME, "auth.json"),
  models: path.join(SIGMA_HOME, "models.json"),
  workspaces: path.join(SIGMA_HOME, "workspaces"),
  gmailToken: path.join(SIGMA_HOME, "gmail-token.json"),
  agentDir: path.join(SIGMA_HOME, "agent"),
} as const;

/** Default model, "provider/id" form. */
export const DEFAULT_MODEL_ID = process.env.SIGMA_MODEL || "deepseek/deepseek-chat";

export type SandboxBackendKind = "docker" | "local" | "auto";

export interface SandboxConfig {
  /** "docker" (isolated, default), "local" (host, not isolated), or "auto" (docker if usable, else local). */
  backend: SandboxBackendKind;
  image: string;
  noNetwork: boolean;
  memory: string;
  cpus: number;
  /** Mount point of the workspace inside the container. */
  workdir: string;
}

function parseBackend(v: string | undefined): SandboxBackendKind {
  return v === "local" || v === "auto" ? v : "docker";
}

export const SANDBOX: SandboxConfig = {
  backend: parseBackend(process.env.SIGMA_SANDBOX_BACKEND),
  image: process.env.SIGMA_SANDBOX_IMAGE || "node:22-bookworm-slim",
  noNetwork: /^true$/i.test(process.env.SIGMA_SANDBOX_NO_NETWORK || ""),
  memory: process.env.SIGMA_SANDBOX_MEMORY || "2g",
  cpus: Number(process.env.SIGMA_SANDBOX_CPUS || "2"),
  workdir: "/work",
};

/** Connector-related environment, read lazily so changes to .env are picked up. */
export const ENV = {
  get deepseekKey() {
    return process.env.DEEPSEEK_API_KEY || "";
  },
  get githubToken() {
    return process.env.GITHUB_TOKEN || "";
  },
  get googleClientId() {
    return process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  },
  get googleClientSecret() {
    return process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  },
  get googleRedirect() {
    return process.env.GOOGLE_OAUTH_REDIRECT || "http://localhost:53682/oauth2callback";
  },
};

/** Create SIGMA_HOME and its subdirectories if missing. Idempotent. */
export function ensureHome(): void {
  for (const dir of [SIGMA_HOME, PATHS.workspaces, PATHS.agentDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
