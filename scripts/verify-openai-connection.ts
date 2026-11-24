import dotenv from 'dotenv';
import OpenAI from 'openai';
import { aiConfig, isRealOpenAiKey } from '../server/ai/config';
import { classifyProviderError } from '../server/ai/provider';

dotenv.config();

const key = (process.env.OPENAI_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
const model = aiConfig.model;

console.log('SchoolCare OpenAI connection test');
console.log(`Configured provider: ${aiConfig.provider}`);
console.log(`Model: ${model} (from ${aiConfig.modelSource})`);
console.log(`OPENAI_API_KEY configured: ${isRealOpenAiKey(key) ? 'yes' : 'no'}`);
console.log(`AI enabled: ${aiConfig.enabledFlag ? 'yes' : 'no'}`);

if (!aiConfig.enabledFlag || !aiConfig.providerSupported) {
  console.log('RESULT: NOT WORKING - AI is disabled or the configured provider is unsupported.');
  process.exitCode = 1;
} else if (!isRealOpenAiKey(key)) {
  console.log('RESULT: NOT WORKING - OPENAI_API_KEY is missing or is a placeholder.');
  process.exitCode = 1;
} else {
  try {
    const client = new OpenAI({ apiKey: key, timeout: 20_000, maxRetries: 1 });
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly OK' }],
      max_completion_tokens: 16
    });
    const text = (response.choices?.[0]?.message?.content || '').trim().slice(0, 40);
    console.log(`Live reply: ${text || '(empty response)'}`);
    if (!text) {
      console.log('RESULT: NOT WORKING - the model returned an empty response.');
      process.exitCode = 1;
    } else {
      console.log('RESULT: WORKING - the configured key and model answered successfully.');
    }
  } catch (error) {
    const classified = classifyProviderError(error);
    console.log(`RESULT: NOT WORKING - ${classified.code}: ${classified.message}`);
    process.exitCode = 1;
  }
}
