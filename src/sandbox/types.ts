/**
 * Execution backend abstraction.
 *
 * A sandbox is anywhere an agent's bash/file tools run. Two backends implement
 * this: DockerSandbox (isolated, the default and the trust boundary) and
 * LocalSandbox (runs on the host — convenient where Docker isn't available, but
 * NOT isolated; opt in explicitly).
 */
export interface ExecResult {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
}

export interface ExecOptions {
  cwd?: string;
  onData?: (data: Buffer) => void;
  signal?: AbortSignal;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

export interface SandboxBackend {
  /** Default working directory for tools (e.g. "/work" for Docker, the host dir for local). */
  readonly workdir: string;
  exec(command: string, opts?: ExecOptions): Promise<{ exitCode: number | null }>;
  execCapture(command: string, cwd?: string): Promise<ExecResult>;
  readFile(absPath: string): Promise<Buffer>;
  writeFile(absPath: string, content: string | Buffer): Promise<void>;
  mkdir(dir: string): Promise<void>;
  access(absPath: string, mode?: "r" | "rw"): Promise<void>;
  destroy(): Promise<void>;
}
