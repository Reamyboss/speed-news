import { AI_CONFIG } from "../env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { NullProvider } from "./null-provider";
import type {
  AiProvider,
  EnrichmentRequest,
  EnrichmentResult,
} from "./types";

export * from "./types";
export { AnthropicProvider } from "./anthropic";
export { GeminiProvider } from "./gemini";
export { GroqProvider } from "./groq";
export { NullProvider } from "./null-provider";

class FallbackProvider implements AiProvider {
  readonly name: string;
  readonly model: string | null;
  readonly isAvailable: boolean;

  constructor(
    private readonly primary: AiProvider,
    private readonly fallback: AiProvider,
  ) {
    this.name = primary.name;
    this.model = primary.model;
    this.isAvailable = primary.isAvailable || fallback.isAvailable;
  }

  async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    if (!this.primary.isAvailable) {
      return this.fallback.enrich(request);
    }

    const primaryResult = await this.primary.enrich(request);

    if (primaryResult.ok || !primaryResult.retryable) {
      return primaryResult;
    }

    if (!this.fallback.isAvailable) {
      return primaryResult;
    }

    console.warn(
      `[ai] ${this.primary.name} returned a retryable failure; ` +
        `falling back to ${this.fallback.name}`,
    );

    return this.fallback.enrich(request);
  }
}

let cached: AiProvider | null = null;

function providerFor(name: string): AiProvider {
  switch (name) {
    case "anthropic":
      return AI_CONFIG.apiKey
        ? new AnthropicProvider(AI_CONFIG.apiKey, AI_CONFIG.model)
        : new NullProvider("ANTHROPIC_API_KEY is not set");

    case "gemini":
      return AI_CONFIG.geminiApiKey
        ? new GeminiProvider(
            AI_CONFIG.geminiApiKey,
            AI_CONFIG.geminiModel,
          )
        : new NullProvider("GEMINI_API_KEY is not set");

    case "groq":
      return AI_CONFIG.groqApiKey
        ? new GroqProvider(
            AI_CONFIG.groqApiKey,
            AI_CONFIG.groqModel,
          )
        : new NullProvider("GROQ_API_KEY is not set");

    default:
      return new NullProvider(`unknown AI_PROVIDER "${name}"`);
  }
}

export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const requested = AI_CONFIG.provider;

  if (requested === "none") {
    cached = new NullProvider("AI_PROVIDER=none");
    return cached;
  }

  let primary: AiProvider;

  if (requested) {
    primary = providerFor(requested);
  } else if (AI_CONFIG.geminiApiKey) {
    primary = providerFor("gemini");
  } else if (AI_CONFIG.groqApiKey) {
    primary = providerFor("groq");
  } else if (AI_CONFIG.apiKey) {
    primary = providerFor("anthropic");
  } else {
    cached = new NullProvider("no AI provider configured");
    return cached;
  }

  const fallbackName = AI_CONFIG.fallbackProvider;

  if (
    fallbackName &&
    fallbackName !== primary.name &&
    fallbackName !== "none"
  ) {
    const fallback = providerFor(fallbackName);

    if (fallback.isAvailable || primary.isAvailable) {
      cached = new FallbackProvider(primary, fallback);
      return cached;
    }
  }

  cached = primary;
  return cached;
}

export function setAiProvider(provider: AiProvider | null): void {
  cached = provider;
}