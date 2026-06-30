/**
 * Context/token-efficiency helpers.
 *
 * Sub-agents are instructed to end with a compact RESULT block; we extract it so
 * the orchestrator ingests a few lines instead of a whole transcript. We also map
 * pi's SessionStats into our RunUsage for per-run accounting.
 */
import type { SessionStats } from "@earendil-works/pi-coding-agent";
import type { RunUsage } from "../domain/runs.js";

/**
 * Pull the trailing RESULT block from a sub-agent's final message. Falls back to
 * the last few non-empty lines (clamped) when no explicit block is present.
 */
export function extractResult(finalText: string | undefined, maxChars = 1200): string {
  if (!finalText) return "(no output)";
  const idx = finalText.lastIndexOf("RESULT:");
  let out: string;
  if (idx !== -1) {
    out = finalText.slice(idx).trim();
  } else {
    const lines = finalText.trim().split("\n").filter((l) => l.trim());
    out = lines.slice(-8).join("\n");
  }
  return out.length > maxChars ? out.slice(0, maxChars) + "\n…[truncated]" : out;
}

export function statsToUsage(stats: SessionStats): RunUsage {
  return {
    tokensInput: stats.tokens.input,
    tokensOutput: stats.tokens.output,
    tokensCacheRead: stats.tokens.cacheRead,
    costUsd: stats.cost,
  };
}

/** Heuristic success check: a RESULT without an obvious failure marker. */
export function looksSuccessful(finalText: string | undefined): boolean {
  if (!finalText) return false;
  const t = finalText.toLowerCase();
  if (!t.includes("result:")) return true; // no contract; assume completion
  return !/(blocked|failed|cannot|could not|error:|unable to)/.test(t.slice(t.lastIndexOf("result:")));
}
