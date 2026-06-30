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
import { SANDBOX } from "../config/settings.js";
import { dockerPing } from "../sandbox/docker.js";
import {
  dockerBashOperations,
  dockerEditOperations,
  dockerReadOperations,
  dockerWriteOperations,
} from "../sandbox/operations.js";
import type { Connector } from "./registry.js";

export const shellConnector: Connector = {
  id: "shell",
  name: "Filesystem & Shell",
  description: "Sandboxed bash + file read/write/edit inside the task's Docker container.",

  async status() {
    try {
      const v = await dockerPing();
      return { status: "connected", detail: `Docker daemon ${v}` };
    } catch (err) {
      return { status: "error", detail: (err as Error).message };
    }
  },

  tools(ctx) {
    if (!ctx.sandbox) return [];
    const cwd = SANDBOX.workdir;
    const sb = ctx.sandbox;
    return [
      createReadToolDefinition(cwd, { operations: dockerReadOperations(sb) }),
      createWriteToolDefinition(cwd, { operations: dockerWriteOperations(sb) }),
      createEditToolDefinition(cwd, { operations: dockerEditOperations(sb) }),
      createBashToolDefinition(cwd, { operations: dockerBashOperations(sb) }),
    ];
  },
};
