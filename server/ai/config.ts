import type { LanguageCode } from '../../src/types';

/**
 * Placeholders must never be mistaken for a configured provider, but valid key
 * prefixes change over time (AIza..., AQ.A..., sk-proj-..., etc.). Accept any
 * sufficiently long, whitespace-free value that is not an obvious placeholder;
 * the provider itself is the final authority and reports invalid keys upstream.
 */
function isRealApiKey(value: string | undefined): boolean {
  if (!value) return false;
  const key = value.trim().replace(/^['"]|['"]$/g, '');
  if (key.length < 20 || /\s/.test(key)) return false;
  if (/^(my[_-]?(gemini|openai)[_-]?api[_-]?key|my[_-]?api[_-]?key|change[_-]?me|your[_-]?api[_-]?key|replace[_-]?me)$/i.test(key)) {
    return false;
  }
  return true;
}

export function isRealGeminiKey(value: string | undefined): boolean {
  return isRealApiKey(value);
}

export function isRealOpenAiKey(value: string | undefined): boolean {
  return isRealApiKey(value);
}

function positiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/** Stable, current model recommended by Google for new low-cost projects. */
export const AI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
/** Strong, cost-conscious default for the OpenAI provider. */
export const AI_DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

const GEMINI_PROVIDER_ALIASES = new Set(['gemini', 'google-gemini', 'google_genai']);
const OPENAI_PROVIDER_ALIASES = new Set(['openai', 'open-ai', 'open_ai']);

export function normalizeAiProvider(value: string | undefined): string {
  const provider = (value || 'gemini').trim().toLowerCase().slice(0, 40);
  if (GEMINI_PROVIDER_ALIASES.has(provider)) return 'gemini';
  if (OPENAI_PROVIDER_ALIASES.has(provider)) return 'openai';
  return provider || 'gemini';
}

/** Env var that holds the key for the currently selected provider. */
export function providerKeyEnvName(): 'GEMINI_API_KEY' | 'OPENAI_API_KEY' {
  return normalizeAiProvider(process.env.AI_PROVIDER) === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
}

export function configuredModel(): string {
  if (providerKeyEnvName() === 'OPENAI_API_KEY') {
    const model = process.env.OPENAI_MODEL || AI_DEFAULT_OPENAI_MODEL;
    return model.trim().slice(0, 100) || AI_DEFAULT_OPENAI_MODEL;
  }
  const model = process.env.GEMINI_MODEL || process.env.AI_MODEL || AI_DEFAULT_MODEL;
  return model.trim().slice(0, 100) || AI_DEFAULT_MODEL;
}

export function modelSource(): 'GEMINI_MODEL' | 'AI_MODEL' | 'OPENAI_MODEL' | 'default' {
  if (providerKeyEnvName() === 'OPENAI_API_KEY') {
    return (process.env.OPENAI_MODEL || '').trim() ? 'OPENAI_MODEL' : 'default';
  }
  if ((process.env.GEMINI_MODEL || '').trim()) return 'GEMINI_MODEL';
  if ((process.env.AI_MODEL || '').trim()) return 'AI_MODEL';
  return 'default';
}

/**
 * A school can store a model override in settings. Ignore it when it clearly
 * belongs to the other provider so switching AI_PROVIDER cannot cause a
 * MODEL_UNAVAILABLE error from a stale Gemini/GPT model name.
 */
export function resolveProviderModel(requested?: string): string {
  const fallback = configuredModel();
  const model = (requested || '').trim().slice(0, 100);
  if (!model) return fallback;
  const isOpenAi = providerKeyEnvName() === 'OPENAI_API_KEY';
  if (isOpenAi && /^(gemini|google[-_])/i.test(model)) return fallback;
  if (!isOpenAi && /^(gpt-|chatgpt-|o\d)/i.test(model)) return fallback;
  return model;
}

/**
 * Getters are deliberate: server.ts calls dotenv.config() after static imports
 * are evaluated, so environment-derived values must be read at request time.
 */
export const aiConfig = {
  get provider(): string {
    return normalizeAiProvider(process.env.AI_PROVIDER);
  },
  get providerSupported(): boolean {
    return aiConfig.provider === 'gemini' || aiConfig.provider === 'openai';
  },
  get model(): string {
    return configuredModel();
  },
  get modelSource(): ReturnType<typeof modelSource> {
    return modelSource();
  },
  get enabledFlag(): boolean {
    return (process.env.AI_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  },
  get hasKey(): boolean {
    return providerKeyEnvName() === 'OPENAI_API_KEY'
      ? isRealOpenAiKey(process.env.OPENAI_API_KEY)
      : isRealGeminiKey(process.env.GEMINI_API_KEY);
  },
  maxMessageChars: 4000,
  maxHistoryMessages: 12,
  maxContextChars: 12_000,
  get timeoutMs(): number {
    return positiveInt(process.env.AI_TIMEOUT_MS, 25_000, 2_000, 120_000);
  },
  get defaultLanguage(): LanguageCode {
    return ((process.env.AI_DEFAULT_LANGUAGE || 'en').trim().toLowerCase() === 'rw' ? 'rw' : 'en') as LanguageCode;
  },
  get rateLimitPerHour(): number {
    return positiveInt(process.env.AI_RATE_LIMIT_PER_HOUR, 60, 1, 10_000);
  },
  get retentionDays(): number {
    return positiveInt(process.env.AI_RETENTION_DAYS, 180, 1, 3650);
  }
};

export function aiAvailability(): { available: boolean; reason?: string } {
  if (!aiConfig.enabledFlag) return { available: false, reason: 'AI is disabled by configuration.' };
  if (!aiConfig.providerSupported) {
    return { available: false, reason: `Unsupported AI provider "${aiConfig.provider}". Configure "gemini" or "openai".` };
  }
  if (!aiConfig.hasKey) {
    return { available: false, reason: `${providerKeyEnvName()} is not configured on the server.` };
  }
  return { available: true };
}
