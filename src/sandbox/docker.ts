/**
 * Docker sandbox: the trust boundary for task execution.
 *
 * Pi has no built-in permission system, so every sub-agent's bash/file tools run
 * inside a per-task container rather than on the host. A host workspace directory
 * is bind-mounted at SANDBOX.workdir so artifacts survive the container and can be
 * pushed via the GitHub connector.
 */
import Docker from "dockerode";
import { SANDBOX } from "../config/settings.js";
import type { ExecResult, SandboxBackend } from "./types.js";

let _docker: Docker | undefined;

export function docker(): Docker {
  if (!_docker) _docker = new Docker();
  return _docker;
}

/** Returns the daemon version, or throws a friendly error if unreachable. */
export async function dockerPing(): Promise<string> {
  try {
    const info = (await docker().version()) as { Version?: string };
    return info.Version ?? "unknown";
  } catch (err) {
    throw new Error(
      `Docker daemon not reachable (${(err as Error).message}). ` +
        `Start Docker and ensure the current user can access /var/run/docker.sock.`,
    );
  }
}

/** True if the image is already present locally (no pull needed). */
export async function imageExists(image: string): Promise<boolean> {
  const images = await docker().listImages({ filters: { reference: [image] } });
  return images.length > 0;
}

async function ensureImage(image: string): Promise<void> {
  if (await imageExists(image)) return;
  try {
    await new Promise<void>((resolve, reject) => {
      docker().pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker().modem.followProgress(stream, (e: Error | null) => (e ? reject(e) : resolve()));
      });
    });
  } catch (err) {
    throw new Error(
      `Could not pull sandbox image "${image}" (${(err as Error).message}). ` +
        `Pull it once with \`docker pull ${image}\`, or set SIGMA_SANDBOX_IMAGE to a locally available image.`,
    );
  }
}

export class DockerSandbox implements SandboxBackend {
  readonly workdir = SANDBOX.workdir;

  private constructor(
    readonly container: Docker.Container,
    readonly workspaceHostDir: string,
  ) {}

  /** Create and start a sandbox with the host workspace bind-mounted at workdir. */
  static async create(name: string, workspaceHostDir: string): Promise<DockerSandbox> {
    await ensureImage(SANDBOX.image);
    const container = await docker().createContainer({
      name: `sigma-${name}-${Date.now()}`,
      Image: SANDBOX.image,
      Cmd: ["sleep", "infinity"],
      WorkingDir: SANDBOX.workdir,
      Tty: false,
      HostConfig: {
        Binds: [`${workspaceHostDir}:${SANDBOX.workdir}`],
        Memory: parseMemory(SANDBOX.memory),
        NanoCpus: Math.round(SANDBOX.cpus * 1e9),
        NetworkMode: SANDBOX.noNetwork ? "none" : "bridge",
        AutoRemove: false,
      },
    });
    await container.start();
    return new DockerSandbox(container, workspaceHostDir);
  }

  /** Run a command, streaming combined output via onData. Returns the exit code. */
  async exec(
    command: string,
    opts: {
      cwd?: string;
      onData?: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
      env?: NodeJS.ProcessEnv;
    } = {},
  ): Promise<{ exitCode: number | null }> {
    const cwd = opts.cwd || SANDBOX.workdir;
    const envList = Object.entries(opts.env ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`);
    const exec = await this.container.exec({
      Cmd: ["bash", "-lc", command],
      WorkingDir: cwd,
      Env: envList,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    return await new Promise<{ exitCode: number | null }>((resolve, reject) => {
      let killed = false;
      const onAbort = () => {
        killed = true;
        stream.destroy();
      };
      if (opts.signal) {
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener("abort", onAbort, { once: true });
      }
      let timer: NodeJS.Timeout | undefined;
      if (opts.timeout && opts.timeout > 0) {
        timer = setTimeout(() => {
          killed = true;
          stream.destroy();
        }, opts.timeout);
      }
      // Demux docker's multiplexed stream into stdout/stderr; forward both to onData.
      const stdout = sink(opts.onData);
      const stderr = sink(opts.onData);
      docker().modem.demuxStream(stream, stdout, stderr);
      stream.on("end", async () => {
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        if (killed) return resolve({ exitCode: null });
        try {
          const info = await exec.inspect();
          resolve({ exitCode: info.ExitCode ?? null });
        } catch (e) {
          reject(e);
        }
      });
      stream.on("error", (e) => {
        if (timer) clearTimeout(timer);
        reject(e);
      });
    });
  }

  /** Run a command and capture stdout/stderr into buffers. */
  async execCapture(command: string, cwd?: string): Promise<ExecResult> {
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const exec = await this.container.exec({
      Cmd: ["bash", "-lc", command],
      WorkingDir: cwd || SANDBOX.workdir,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve, reject) => {
      const so = new WritableCollector(outChunks);
      const se = new WritableCollector(errChunks);
      docker().modem.demuxStream(stream, so, se);
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const info = await exec.inspect();
    return {
      exitCode: info.ExitCode ?? null,
      stdout: Buffer.concat(outChunks),
      stderr: Buffer.concat(errChunks),
    };
  }

  /** Write a file inside the container (binary-safe via base64). */
  async writeFile(absPath: string, content: string | Buffer): Promise<void> {
    const b64 = Buffer.from(content).toString("base64");
    const dir = absPath.replace(/\/[^/]*$/, "") || "/";
    const res = await this.execCapture(
      `mkdir -p ${shq(dir)} && printf '%s' ${shq(b64)} | base64 -d > ${shq(absPath)}`,
    );
    if (res.exitCode !== 0) {
      throw new Error(`writeFile ${absPath} failed: ${res.stderr.toString("utf8")}`);
    }
  }

  /** Read a file from the container as a Buffer (binary-safe via base64). */
  async readFile(absPath: string): Promise<Buffer> {
    const res = await this.execCapture(`base64 ${shq(absPath)}`);
    if (res.exitCode !== 0) {
      throw new Error(`readFile ${absPath} failed: ${res.stderr.toString("utf8")}`);
    }
    return Buffer.from(res.stdout.toString("utf8"), "base64");
  }

  async mkdir(dir: string): Promise<void> {
    const res = await this.execCapture(`mkdir -p ${shq(dir)}`);
    if (res.exitCode !== 0) throw new Error(`mkdir ${dir} failed: ${res.stderr.toString("utf8")}`);
  }

  /** Throw if the path is not accessible with the given mode (r/rw). */
  async access(absPath: string, mode: "r" | "rw" = "r"): Promise<void> {
    const flag = mode === "rw" ? "-r -a -w" : "-r";
    const test = mode === "rw" ? `test -r ${shq(absPath)} && test -w ${shq(absPath)}` : `test -r ${shq(absPath)}`;
    void flag;
    const res = await this.execCapture(test);
    if (res.exitCode !== 0) throw new Error(`Path not accessible (${mode}): ${absPath}`);
  }

  async destroy(): Promise<void> {
    try {
      await this.container.remove({ force: true });
    } catch {
      /* already gone */
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Shell-quote a value for safe single-argument interpolation. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function parseMemory(s: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/i.exec(s.trim());
  if (!m) return 2 * 1024 ** 3;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === "g" ? 1024 ** 3 : unit === "m" ? 1024 ** 2 : unit === "k" ? 1024 : 1;
  return Math.round(n * mult);
}

import { Writable } from "node:stream";

/** A minimal Writable that forwards chunks to an optional callback. */
function sink(onData?: (data: Buffer) => void): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      if (onData) onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
}

/** A Writable that collects chunks into an array. */
class WritableCollector extends Writable {
  constructor(private chunks: Buffer[]) {
    super();
  }
  _write(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    cb();
  }
}
