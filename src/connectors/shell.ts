/**
 * Filesystem & Shell connector.
 *
 * Provides the execution substrate for software tasks: pi's read/write/edit/bash
 * tools, but bound to the task's Docker sandbox via the operation adapters. Only
 * agents whose role enables the "shell" connector can touch a filesystem at all.
 */
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { describeBackend } from "../sandbox/index.js";
import {
  sandboxBashOperations,
  sandboxEditOperations,
  sandboxReadOperations,
  sandboxWriteOperations,
} from "../sandbox/operations.js";
import type { Connector } from "./registry.js";

export const shellConnector: Connector = {
  id: "shell",
  name: "Filesystem & Shell",
  description: "Sandboxed bash + file read/write/edit inside the task's sandbox.",

  async status() {
    const b = await describeBackend();
    return {
      status: b.ok ? ("connected" as const) : ("error" as const),
      detail: `${b.kind}: ${b.detail}`,
    };
  },

  tools(ctx) {
    if (!ctx.sandbox) return [];
    const sb = ctx.sandbox;
    const cwd = sb.workdir;
    return [
      createReadToolDefinition(cwd, { operations: sandboxReadOperations(sb) }),
      createWriteToolDefinition(cwd, { operations: sandboxWriteOperations(sb) }),
      createEditToolDefinition(cwd, { operations: sandboxEditOperations(sb) }),
      createBashToolDefinition(cwd, { operations: sandboxBashOperations(sb) }),
    ];
  },
};
