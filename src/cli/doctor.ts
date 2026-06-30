/** `sigma doctor` — verify the environment is ready to run. */
import { bootstrapSync } from "../bootstrap.js";
import { defaultModelHasAuth, getDefaultModel } from "../config/models.js";
import { DEFAULT_MODEL_ID, PATHS } from "../config/settings.js";
import { listConnectorImpls } from "../connectors/index.js";
import { discoverBuiltinSkills } from "../skills/index.js";
import { describeBackend } from "../sandbox/index.js";
import { c } from "../tui/ui.js";

type Check = { ok: boolean; label: string; detail: string };

export async function doctor(): Promise<boolean> {
  bootstrapSync();
  const checks: Check[] = [];

  checks.push({ ok: true, label: "Home", detail: PATHS.home });

  try {
    const m = getDefaultModel();
    const auth = await defaultModelHasAuth();
    checks.push({
      ok: auth,
      label: "Model",
      detail: `${m.provider}/${m.id}${auth ? "" : " — missing API key (set DEEPSEEK_API_KEY)"}`,
    });
  } catch (e) {
    checks.push({ ok: false, label: "Model", detail: `${DEFAULT_MODEL_ID}: ${(e as Error).message}` });
  }

  const backend = await describeBackend();
  checks.push({ ok: backend.ok, label: "Sandbox", detail: `${backend.kind} — ${backend.detail}` });

  checks.push({ ok: true, label: "Database", detail: PATHS.db });
  checks.push({ ok: true, label: "Skills", detail: `${discoverBuiltinSkills().length} built-in` });

  for (const impl of listConnectorImpls()) {
    const s = await impl.status();
    checks.push({ ok: s.status === "connected", label: `Connector ${impl.id}`, detail: `[${s.status}] ${s.detail}` });
  }

  console.log(c.bold("\nSigma doctor\n"));
  for (const ck of checks) {
    const mark = ck.ok ? c.green("✓") : c.yellow("•");
    console.log(`  ${mark} ${ck.label.padEnd(18)} ${c.dim(ck.detail)}`);
  }
  const blockers = new Set(["Model", "Sandbox"]);
  const blocking = checks.filter((ck) => !ck.ok && blockers.has(ck.label));
  console.log(
    blocking.length
      ? c.yellow(`\n  ${blocking.length} item(s) need attention before tasks can run.\n`)
      : c.green("\n  Ready.\n"),
  );
  return blocking.length === 0;
}
