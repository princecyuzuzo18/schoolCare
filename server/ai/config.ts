import type { LanguageCode } from '../../src/types';

/**
 * Placeholders must never be mistaken for a configured provider, but valid key
 * prefixes change over time (AIza..., AQ.A..., etc.). Accept any sufficiently
 * long, whitespace-free value that is not an obvious placeholder; the provider
 * itself is the final authority and reports invalid keys as an upstream error.
 */
export function isRealGeminiKey(value: string | undefined): boolean {
  if (!value) return false;
  const key = value.trim().replace(/^['"]|['"]$/g, '');
  if (key.length < 20 || /\s/.test(key)) return false;
  if (/^(my[_-]?gemini[_-]?api[_-]?key|change[_-]?me|your[_-]?api[_-]?key|replace[_-]?me)$/i.test(key)) {
    return false;
  }
  return true;
}

function positiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export const AI_DEFAULT_MODEL = 'gemini-flash-latest';

/**
 * Getters are deliberate: server.ts calls dotenv.config() after static imports
 * are evaluated, so environment-derived values must be read at request time.
 */
export const aiConfig = {
  provider: 'google-gemini' as const,
  get model(): string {
    return (process.env.AI_MODEL || AI_DEFAULT_MODEL).trim().slice(0, 100);
  },
  get enabledFlag(): boolean {
    return (process.env.AI_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  },
  get hasKey(): boolean {
    return isRealGeminiKey(process.env.GEMINI_API_KEY);
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
  if (!aiConfig.hasKey) {
    return { available: false, reason: 'GEMINI_API_KEY is not configured on the server.' };
  }
  return { available: true };
}
