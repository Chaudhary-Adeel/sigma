/**
 * Local (non-Docker) execution backend.
 *
 * Runs the agent's bash/file tools directly on the host, scoped to the task's
 * workspace directory. This is NOT a security boundary — use it only in trusted
 * environments or where Docker isn't available. Selected via
 * SIGMA_SANDBOX_BACKEND=local (or =auto when Docker can't pull an image).
 */
import { spawn } from "node:child_process";
import { access as fsAccess, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecOptions, ExecResult, SandboxBackend } from "./types.js";

export class LocalSandbox implements SandboxBackend {
  private constructor(readonly workdir: string) {}

  static async create(_name: string, workspaceHostDir: string): Promise<LocalSandbox> {
    await mkdir(workspaceHostDir, { recursive: true });
    return new LocalSandbox(path.resolve(workspaceHostDir));
  }

  /** Resolve a tool-supplied path against the workspace; keep absolutes as-is. */
  private resolve(p: string): string {
    return path.isAbsolute(p) ? p : path.join(this.workdir, p);
  }

  async exec(command: string, opts: ExecOptions = {}): Promise<{ exitCode: number | null }> {
    return await new Promise((resolve, reject) => {
      const child = spawn("bash", ["-lc", command], {
        cwd: opts.cwd ? this.resolve(opts.cwd) : this.workdir,
        env: { ...process.env, ...(opts.env ?? {}) },
      });
      let killed = false;
      const onAbort = () => {
        killed = true;
        child.kill("SIGKILL");
      };
      if (opts.signal) {
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener("abort", onAbort, { once: true });
      }
      const timer = opts.timeout && opts.timeout > 0
        ? setTimeout(() => { killed = true; child.kill("SIGKILL"); }, opts.timeout)
        : undefined;
      child.stdout.on("data", (d) => opts.onData?.(Buffer.from(d)));
      child.stderr.on("data", (d) => opts.onData?.(Buffer.from(d)));
      child.on("error", reject);
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        resolve({ exitCode: killed ? null : code });
      });
    });
  }

  async execCapture(command: string, cwd?: string): Promise<ExecResult> {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn("bash", ["-lc", command], {
        cwd: cwd ? this.resolve(cwd) : this.workdir,
        env: process.env,
      });
      child.stdout.on("data", (d) => out.push(Buffer.from(d)));
      child.stderr.on("data", (d) => err.push(Buffer.from(d)));
      child.on("error", reject);
      child.on("close", resolve);
    });
    return { exitCode: code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) };
  }

  async readFile(absPath: string): Promise<Buffer> {
    return readFile(this.resolve(absPath));
  }

  async writeFile(absPath: string, content: string | Buffer): Promise<void> {
    const target = this.resolve(absPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  async mkdir(dir: string): Promise<void> {
    await mkdir(this.resolve(dir), { recursive: true });
  }

  async access(absPath: string, mode: "r" | "rw" = "r"): Promise<void> {
    const flags = mode === "rw" ? constants.R_OK | constants.W_OK : constants.R_OK;
    await fsAccess(this.resolve(absPath), flags);
  }

  async destroy(): Promise<void> {
    // Workspace is intentionally preserved for inspection / artifacts.
  }
}
