import { GoogleGenAI } from '@google/genai';
import { aiAvailability, aiConfig, isRealGeminiKey } from './config';
import type { LanguageCode } from '../../src/types';

export type AiProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiProviderErrorCode,
    message: string
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
 * Generate an answer using the already-installed Google GenAI SDK.
 * The API key is read only on the server and is never part of a response.
 */
export async function generateAssistantReply(request: AiGenerationRequest): Promise<AiGenerationResult> {
  if (testGenerator) {
    const text = String(await testGenerator(request)).trim();
    if (!text) throw new AiProviderError('INVALID_RESPONSE', 'The AI service returned an empty response.');
    return { text, model: 'test-provider' };
  }

  const availability = aiAvailability();
  if (!availability.available) {
    throw new AiProviderError(
      aiConfig.enabledFlag ? 'NOT_CONFIGURED' : 'DISABLED',
      availability.reason ?? 'The AI service is unavailable.'
    );
  }
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  if (!isRealGeminiKey(key)) {
    throw new AiProviderError('NOT_CONFIGURED', 'GEMINI_API_KEY is not configured on the server.');
  }

  const model = (request.model || aiConfig.model).slice(0, 100);
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
    if (!text) {
      throw new AiProviderError('INVALID_RESPONSE', 'The AI service returned an empty response.');
    }
    return { text, model };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (controller.signal.aborted) {
      throw new AiProviderError('TIMEOUT', 'The AI service took too long to respond. Please try again.');
    }
    // Log a short, credential-free classification. Upstream bodies may echo
    // request details, so they are deliberately not logged.
    const message = error instanceof Error ? error.message.slice(0, 200) : 'Unknown provider error';
    console.warn(`[AI] Provider request failed (${model}):`, message);
    throw new AiProviderError('UNAVAILABLE', 'The AI service could not answer right now. Please try again.');
  } finally {
    clearTimeout(timeout);
  }
}
