/**
 * Adapters that back pi's read/write/edit/bash tools with a sandbox backend.
 *
 * pi's tool factories (createBashToolDefinition, createReadToolDefinition, …)
 * accept pluggable operations. By supplying these, the agent's file and shell
 * tools execute inside the container instead of on the host — without the agent
 * loop knowing anything changed.
 */
import type {
  BashOperations,
  EditOperations,
  ReadOperations,
  WriteOperations,
} from "@earendil-works/pi-coding-agent";
import type { SandboxBackend } from "./types.js";

export function sandboxBashOperations(sandbox: SandboxBackend): BashOperations {
  return {
    exec: (command, cwd, options) =>
      sandbox.exec(command, {
        cwd,
        onData: options.onData,
        signal: options.signal,
        timeout: options.timeout,
        env: options.env,
      }),
  };
}

export function sandboxReadOperations(sandbox: SandboxBackend): ReadOperations {
  return {
    readFile: (absPath) => sandbox.readFile(absPath),
    access: (absPath) => sandbox.access(absPath, "r"),
    // Treat everything as non-image inside the sandbox (text-first workflow).
    detectImageMimeType: async () => null,
  };
}

export function sandboxWriteOperations(sandbox: SandboxBackend): WriteOperations {
  return {
    writeFile: (absPath, content) => sandbox.writeFile(absPath, content),
    mkdir: (dir) => sandbox.mkdir(dir),
  };
}

export function sandboxEditOperations(sandbox: SandboxBackend): EditOperations {
  return {
    readFile: (absPath) => sandbox.readFile(absPath),
    writeFile: (absPath, content) => sandbox.writeFile(absPath, content),
    access: (absPath) => sandbox.access(absPath, "rw"),
  };
}
