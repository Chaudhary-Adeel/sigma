/** Sandbox factory: pick a backend per configuration / availability. */
import { SANDBOX } from "../config/settings.js";
import { DockerSandbox, dockerPing, imageExists } from "./docker.js";
import { LocalSandbox } from "./local.js";
import type { SandboxBackend } from "./types.js";

export type { SandboxBackend, ExecResult, ExecOptions } from "./types.js";
export { DockerSandbox, dockerPing, imageExists } from "./docker.js";
export { LocalSandbox } from "./local.js";

let _warnedLocal = false;

export async function createSandbox(name: string, workspaceHostDir: string): Promise<SandboxBackend> {
  if (SANDBOX.backend === "local") return LocalSandbox.create(name, workspaceHostDir);
  if (SANDBOX.backend === "docker") return DockerSandbox.create(name, workspaceHostDir);

  // auto: prefer Docker when the daemon is up and the image is present; else local.
  try {
    await dockerPing();
    if (await imageExists(SANDBOX.image)) return DockerSandbox.create(name, workspaceHostDir);
  } catch {
    /* fall through */
  }
  if (!_warnedLocal) {
    console.warn("[sigma] Docker unavailable; using LOCAL (non-isolated) sandbox. Set SIGMA_SANDBOX_BACKEND=docker to require isolation.");
    _warnedLocal = true;
  }
  return LocalSandbox.create(name, workspaceHostDir);
}

/** Human-readable backend description for `sigma doctor`. */
export async function describeBackend(): Promise<{ kind: string; ok: boolean; detail: string }> {
  if (SANDBOX.backend === "local") {
    return { kind: "local", ok: true, detail: "host execution (not isolated)" };
  }
  let dockerOk = false;
  let imgOk = false;
  let detail = "";
  try {
    await dockerPing();
    dockerOk = true;
    imgOk = await imageExists(SANDBOX.image);
  } catch (e) {
    detail = (e as Error).message;
  }
  if (SANDBOX.backend === "docker") {
    return {
      kind: "docker",
      ok: dockerOk && imgOk,
      detail: !dockerOk ? detail : imgOk ? `image ${SANDBOX.image} present` : `image ${SANDBOX.image} not pulled`,
    };
  }
  // auto
  if (dockerOk && imgOk) return { kind: "auto→docker", ok: true, detail: `image ${SANDBOX.image} present` };
  return { kind: "auto→local", ok: true, detail: "Docker unusable; will run locally (not isolated)" };
}
