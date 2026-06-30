/**
 * Model registry + auth wiring.
 *
 * On first use we copy the bundled models.json into SIGMA_HOME so the user can
 * edit providers/costs, then load it through pi's ModelRegistry. The registry
 * resolves API keys from the environment (DEEPSEEK_API_KEY etc.) via $ENV
 * interpolation in models.json, with AuthStorage as the credential backend.
 */
import { copyFileSync, existsSync } from "node:fs";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai/compat";
import type { Api } from "@earendil-works/pi-ai";
import { BUNDLED_MODELS_JSON, DEFAULT_MODEL_ID, ENV, PATHS, ensureHome } from "./settings.js";

let _authStorage: AuthStorage | undefined;
let _registry: ModelRegistry | undefined;

/** Ensure a user-editable models.json exists under SIGMA_HOME. */
function ensureModelsJson(): void {
  ensureHome();
  if (!existsSync(PATHS.models)) {
    copyFileSync(BUNDLED_MODELS_JSON, PATHS.models);
  }
}

export function getAuthStorage(): AuthStorage {
  if (!_authStorage) {
    ensureHome();
    _authStorage = AuthStorage.create(PATHS.auth);
    // Inject env keys as runtime overrides so models.json $ENV resolution and
    // direct provider lookups both succeed even when nothing is persisted.
    if (ENV.deepseekKey) _authStorage.setRuntimeApiKey("deepseek", ENV.deepseekKey);
  }
  return _authStorage;
}

export function getModelRegistry(): ModelRegistry {
  if (!_registry) {
    ensureModelsJson();
    _registry = ModelRegistry.create(getAuthStorage(), PATHS.models);
    _registry.refresh();
    const err = _registry.getError();
    if (err) throw new Error(`Failed to load models.json: ${err}`);
  }
  return _registry;
}

/** Parse a "provider/id" string. */
export function parseModelId(id: string): { provider: string; modelId: string } {
  const idx = id.indexOf("/");
  if (idx === -1) throw new Error(`Invalid model id "${id}" (expected provider/model)`);
  return { provider: id.slice(0, idx), modelId: id.slice(idx + 1) };
}

/** Resolve a model by "provider/id". Throws if unknown. */
export function resolveModel(id: string): Model<Api> {
  const { provider, modelId } = parseModelId(id);
  const model = getModelRegistry().find(provider, modelId);
  if (!model) {
    const available = getModelRegistry()
      .getAll()
      .map((m) => `${m.provider}/${m.id}`)
      .join(", ");
    throw new Error(`Unknown model "${id}". Available: ${available || "(none)"}`);
  }
  return model;
}

/**
 * Optional process-wide model override. When set, it takes precedence over the
 * configured default for the orchestrator and any role that doesn't pin its own
 * model. Used to force a model object that isn't in models.json (e.g. a faux
 * provider in tests, or a runtime-registered provider).
 */
let _override: Model<Api> | undefined;

export function setModelOverride(model: Model<Api> | undefined): void {
  _override = model;
}

export function getDefaultModel(): Model<Api> {
  return _override ?? resolveModel(DEFAULT_MODEL_ID);
}

/** True if the default model has a usable API key configured. */
export async function defaultModelHasAuth(): Promise<boolean> {
  try {
    const model = getDefaultModel();
    return getModelRegistry().hasConfiguredAuth(model);
  } catch {
    return false;
  }
}
