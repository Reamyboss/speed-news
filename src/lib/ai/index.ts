import { AI_CONFIG } from "../env";
import { AnthropicProvider } from "./anthropic";
import { NullProvider } from "./null-provider";
import type { AiProvider } from "./types";

export * from "./types";
export { AnthropicProvider } from "./anthropic";
export { NullProvider } from "./null-provider";

let cached: AiProvider | null = null;

/**
 * Resolves the configured AI provider.
 *
 * Selection is data-driven so a new provider is a registry entry here plus a
 * class implementing `AiProvider` — no changes anywhere else in the codebase.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const requested = AI_CONFIG.provider;

  // An explicit opt-out always wins.
  if (requested === "none") {
    cached = new NullProvider("AI_PROVIDER=none");
    return cached;
  }

  // Default to Anthropic when a key exists, even if AI_PROVIDER is unset —
  // supplying a key is a clear signal of intent.
  if (requested === "anthropic" || (!requested && AI_CONFIG.apiKey)) {
    if (!AI_CONFIG.apiKey) {
      cached = new NullProvider("ANTHROPIC_API_KEY is not set");
      return cached;
    }
    cached = new AnthropicProvider(AI_CONFIG.apiKey, AI_CONFIG.model);
    return cached;
  }

  if (requested && requested !== "anthropic") {
    cached = new NullProvider(`unknown AI_PROVIDER "${requested}"`);
    return cached;
  }

  cached = new NullProvider("no AI provider configured");
  return cached;
}

/** Test seam — lets a suite inject a stub provider. */
export function setAiProvider(provider: AiProvider | null): void {
  cached = provider;
}
