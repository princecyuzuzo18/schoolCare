import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import {
  aiAvailability,
  aiConfig,
  isRealGeminiKey,
  isRealOpenAiKey,
  providerKeyEnvName,
  resolveProviderModel
} from './config';
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
  NOT_CONFIGURED: 'The AI provider key is not configured on the server. Ask an administrator to configure it.',
  DISABLED: 'The AI service is disabled by configuration.',
  UNSUPPORTED_PROVIDER: 'This SchoolCare build supports the Gemini and OpenAI providers. Ask an administrator to check AI_PROVIDER.',
  INVALID_KEY: 'The AI provider rejected the configured key. Ask an administrator to check the provider API key.',
  QUOTA_EXCEEDED: 'The AI provider account has no credits remaining or has hit a rate limit. Add credits or review your account limits, then try again.',
  MODEL_UNAVAILABLE: 'The selected AI model is temporarily unavailable or not available to this account. Please try again later or ask an administrator to choose another supported model.',
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
  const err = error as { status?: unknown; code?: unknown } | null;
  const status = typeof err?.status === 'number' ? String(err.status) : '';
  const code = typeof err?.code === 'string' ? err.code : '';
  const text = `${raw} ${status} ${code}`.toLowerCase();

  if (/api[_ -]?key not valid|api[_ -]?key[_ -]?invalid|incorrect api key|invalid[_ -]?api[_ -]?key|unauthenticated|permission[_ -]?denied|"code"\s*:\s*401|\b401\b|\b403\b/.test(text)) {
    return new AiProviderError('INVALID_KEY');
  }
  if (/resource_exhausted|"code"\s*:\s*429|\b429\b|quota|rate[_ -]?limit|too many requests|requests per (minute|day)|insufficient_quota|\brpd\b|\brpm\b/.test(text)) {
    return new AiProviderError('QUOTA_EXCEEDED');
  }
  if (/model.*(not found|not available|no longer available|does not exist)|"code"\s*:\s*404|\b404\b/.test(text)) {
    return new AiProviderError('MODEL_UNAVAILABLE');
  }
  if (/fetch failed|network|enotfound|econnreset|eai_again|etimedout|socket hang up|dns|connection error/.test(text)) {
    return new AiProviderError('NETWORK_ERROR');
  }
  if (/unavailable|high demand|overloaded|temporarily|"code"\s*:\s*503|\b503\b/.test(text)) {
    return new AiProviderError('UNAVAILABLE');
  }
  return new AiProviderError('UNAVAILABLE');
}

/** Reasoning models reject a non-default temperature; omit it for those. */
function supportsTemperature(model: string): boolean {
  return !/^(gpt-5|o\d|chatgpt-)/i.test(model);
}

/**
 * Generate an answer using the configured provider SDK.
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

  const provider = aiConfig.provider;
  const key = (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY)
    ?.trim()
    .replace(/^['"]|['"]$/g, '');
  if (!key || (provider === 'openai' ? !isRealOpenAiKey(key) : !isRealGeminiKey(key))) {
    throw new AiProviderError('NOT_CONFIGURED', `${providerKeyEnvName()} is not configured on the server.`);
  }

  const model = resolveProviderModel(request.model);
  const retryable = new Set<AiProviderErrorCode>(['UNAVAILABLE', 'NETWORK_ERROR']);
  let lastError: AiProviderError | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), aiConfig.timeoutMs);
    try {
      if (provider === 'openai') {
        const client = new OpenAI({ apiKey: key, timeout: aiConfig.timeoutMs, maxRetries: 1 });
        const response = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: 'system', content: request.systemInstruction },
              ...request.messages.map(message => ({ role: message.role, content: message.content }))
            ],
            ...(supportsTemperature(model) ? { temperature: 0.35 } : {}),
            max_completion_tokens: 2048
          },
          { signal: controller.signal }
        );
        const text = response.choices?.[0]?.message?.content?.trim();
        if (!text) throw new AiProviderError('INVALID_RESPONSE');
        return { text, model };
      }

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
      console.warn(`[AI] Provider request failed (${provider}/${model}): ${classified.code}`);
      throw classified;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new AiProviderError('UNAVAILABLE');
}
