import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { aiConfig, isRealGeminiKey } from '../server/ai/config';
import { classifyProviderError } from '../server/ai/provider';

dotenv.config();

/** Build a credential-free error message from an upstream HTTP response. */
async function responseError(response: Response): Promise<Error> {
  const status = `HTTP ${response.status}`;
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string; reason?: string; status?: string };
    };
    const detail = [payload.error?.message, payload.error?.reason, payload.error?.status]
      .filter(Boolean)
      .join(' ');
    return new Error(detail ? `${status} ${detail}` : status);
  } catch {
    return new Error(status);
  }
}

const key = (process.env.GEMINI_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
const model = (process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-3.5-flash-lite').trim();

console.log('SchoolCare Gemini connection test');
console.log(`Provider: ${aiConfig.provider}`);
console.log(`Model: ${model} (from ${aiConfig.modelSource})`);
console.log(`API key configured: ${isRealGeminiKey(key) ? 'yes' : 'no'}`);
console.log(`AI enabled: ${aiConfig.enabledFlag ? 'yes' : 'no'}`);

if (!aiConfig.enabledFlag || !aiConfig.providerSupported) {
  console.log('RESULT: NOT WORKING - AI is disabled or the configured provider is unsupported.');
  process.exitCode = 1;
} else if (!isRealGeminiKey(key)) {
  console.log('RESULT: NOT WORKING - GEMINI_API_KEY is missing or is a placeholder.');
  process.exitCode = 1;
} else {
  try {
    const listResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (!listResponse.ok) {
      const classified = classifyProviderError(await responseError(listResponse));
      console.log(`Model list check: FAILED (${classified.code})`);
      console.log(`RESULT: NOT WORKING - ${classified.message}`);
      process.exitCode = 1;
    } else {
      const data = (await listResponse.json()) as { models?: Array<{ name?: string }> };
      const listed = (data.models || []).some(item => item.name === `models/${model}`);
      console.log(`Model present in current API model list: ${listed ? 'yes' : 'no'}`);

      const ai = new GoogleGenAI({ apiKey: key });
      let text = '';
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: 'Reply with exactly OK',
            config: { maxOutputTokens: 16, abortSignal: AbortSignal.timeout(20_000) }
          });
          text = (response.text || '').trim().slice(0, 40);
          break;
        } catch (error) {
          const classified = classifyProviderError(error);
          if (classified.code === 'UNAVAILABLE' && attempt < 3) continue;
          throw error;
        }
      }
      console.log(`Live reply: ${text || '(empty response)'}`);
      if (!text) {
        console.log('RESULT: NOT WORKING - the model returned an empty response.');
        process.exitCode = 1;
      } else {
        console.log('RESULT: WORKING - the configured key and model answered successfully.');
      }
    }
  } catch (error) {
    const classified = classifyProviderError(error);
    console.log(`RESULT: NOT WORKING - ${classified.code}: ${classified.message}`);
    process.exitCode = 1;
  }
}
