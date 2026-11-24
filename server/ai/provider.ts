import { GoogleGenAI } from '@google/genai';
import { aiAvailability, aiConfig, isRealGeminiKey } from './config';
import type { LanguageCode } from '../../src/types';

export type AiProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'UNSUPPORTED_PROVIDER'
  | 'INVALID_KEY'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE';

const SAFE_MESSAGES: Record<AiProviderErrorCode, string> = {
  NOT_CONFIGURED: 'GEMINI_API_KEY is not configured on the server. Ask an administrator to configure it.',
  DISABLED: 'The AI service is disabled by configuration.',
  UNSUPPORTED_PROVIDER: 'This SchoolCare build supports only the Gemini provider. Ask an administrator to check AI_PROVIDER.',
  INVALID_KEY: 'The AI provider rejected the configured key. Ask an administrator to check GEMINI_API_KEY.',
  QUOTA_EXCEEDED: 'The AI free-tier quota or project rate limit has been reached. Please wait for quota renewal or review your project’s available limits in Google AI Studio.',
  MODEL_UNAVAILABLE: 'The selected AI model is temporarily unavailable or not available to this project. Please try again later or ask an administrator to choose another supported model.',
  TIMEOUT: 'The AI service took too long to respond. Please try again.',
  NETWORK_ERROR: 'The AI service could not be reached. Check network connectivity and try again.',
  UNAVAILABLE: 'The AI service could not answer right now. Please try again.',
  INVALID_RESPONSE: 'The AI service returned an empty response. Please try again.'
};

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiProviderErrorCode,
    message: string = SAFE_MESSAGES[code]
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiGenerationRequest {
  systemInstruction: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  language: LanguageCode;
  model?: string;
}

export interface AiGenerationResult {
  text: string;
  model: string;
}

type TestGenerator = (request: AiGenerationRequest) => Promise<string> | string;

let testGenerator: TestGenerator | null = null;

/** Test-only injection point. Never exposed through HTTP or the browser. */
export function __setAiGeneratorForTests(generator: TestGenerator | null): void {
  testGenerator = generator;
}

/**
 * Translate an upstream failure into a stable, credential-free error code.
 * The raw provider message is deliberately never returned or logged.
 */
export function classifyProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const text = raw.toLowerCase();

  if (/api[_ -]?key not valid|api[_ -]?key[_ -]?invalid|invalid[_ -]?api[_ -]?key|unauthenticated|permission[_ -]?denied|"code"\s*:\s*401|"code"\s*:\s*403|\b401\b|\b403\b/.test(text)) {
    return new AiProviderError('INVALID_KEY');
  }
  if (/resource_exhausted|"code"\s*:\s*429|\b429\b|quota|rate[_ -]?limit|too many requests|requests per (minute|day)|rpd|\brpm\b/.test(text)) {
    return new AiProviderError('QUOTA_EXCEEDED');
  }
  if (/model.*(not found|not available|no longer available|does not exist)|"code"\s*:\s*404|\b404\b/.test(text)) {
    return new AiProviderError('MODEL_UNAVAILABLE');
  }
  if (/fetch failed|network|enotfound|econnreset|eai_again|etimedout|socket hang up|dns/.test(text)) {
    return new AiProviderError('NETWORK_ERROR');
  }
  if (/unavailable|high demand|overloaded|temporarily|"code"\s*:\s*503|\b503\b/.test(text)) {
    return new AiProviderError('UNAVAILABLE');
  }
  return new AiProviderError('UNAVAILABLE');
}

/**
 * Generate an answer using the already-installed Google GenAI SDK.
 * The API key is read only on the server and is never part of a response.
 */
export async function generateAssistantReply(request: AiGenerationRequest): Promise<AiGenerationResult> {
  if (testGenerator) {
    const text = String(await testGenerator(request)).trim();
    if (!text) throw new AiProviderError('INVALID_RESPONSE');
    return { text, model: 'test-provider' };
  }

  const availability = aiAvailability();
  if (!availability.available) {
    const code = !aiConfig.enabledFlag
      ? 'DISABLED'
      : !aiConfig.providerSupported
        ? 'UNSUPPORTED_PROVIDER'
        : 'NOT_CONFIGURED';
    throw new AiProviderError(code, availability.reason ?? SAFE_MESSAGES[code]);
  }
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!isRealGeminiKey(key)) {
    throw new AiProviderError('NOT_CONFIGURED');
  }

  const model = (request.model || aiConfig.model).slice(0, 100);
  const retryable = new Set<AiProviderErrorCode>(['UNAVAILABLE', 'NETWORK_ERROR']);
  let lastError: AiProviderError | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), aiConfig.timeoutMs);
    try {
      const client = new GoogleGenAI({ apiKey: key });
      const response = await client.models.generateContent({
        model,
        contents: request.messages.map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        })),
        config: {
          systemInstruction: request.systemInstruction,
          temperature: 0.35,
          maxOutputTokens: 2048,
          abortSignal: controller.signal
        }
      });
      const text = response.text?.trim();
      if (!text) throw new AiProviderError('INVALID_RESPONSE');
      return { text, model };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted) throw new AiProviderError('TIMEOUT');
      const classified = classifyProviderError(error);
      if (retryable.has(classified.code) && attempt === 1) {
        lastError = classified;
        continue;
      }
      // Log only the stable classification, never the upstream body or key.
      console.warn(`[AI] Provider request failed (${model}): ${classified.code}`);
      throw classified;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new AiProviderError('UNAVAILABLE');
}
