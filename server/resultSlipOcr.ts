import type { AcademicPerformanceData } from '../src/types';
import { normalizeAcademicPerformance } from './admissions';

export interface ResultSlipExtraction {
  status: 'EXTRACTED' | 'UNAVAILABLE' | 'ERROR';
  data?: AcademicPerformanceData;
  message?: string;
}

const PROMPT = `You are reading an official Senior 3 result slip or certificate for a Rwandan secondary school admission.
Extract ONLY information that is clearly printed on the document.
Rules you must follow:
- Never guess, infer, estimate, translate a grade, or calculate totals/averages/aggregates/divisions.
- If a field is missing or unreadable, return null for it.
- subjects must contain only subjects actually visible, with the printed marks and/or grade. Keep marks and grades as printed strings (for example "78", "A", "12/20").
- Do not include comments, explanations, or prose outside the JSON object.

Return one JSON object with exactly this shape:
{
  "studentName": string|null,
  "examinationYear": string|null,
  "subjects": [{"name": string, "marks": string|null, "grade": string|null}],
  "total": string|null,
  "aggregate": string|null,
  "division": string|null
}`;

/**
 * Optional extraction. Failure never blocks the application; the original document is
 * the only source of truth and is preserved untouched.
 */
export async function extractAcademicPerformance(file: Express.Multer.File): Promise<ResultSlipExtraction> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { status: 'UNAVAILABLE', message: 'Automatic extraction is not configured on this server.' };
  }

  const model = process.env.GEMINI_RESULT_SLIP_MODEL || 'gemini-1.5-flash';
  // Keep the credential out of the URL so proxies and access logs cannot
  // retain it. Google's API accepts the same key in the x-goog-api-key header.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: file.mimetype.toLowerCase(), data: file.buffer.toString('base64') } }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      // Upstream bodies can echo request details; log only the HTTP status.
      console.warn('[Admissions OCR] Upstream request failed with status', response.status);
      return { status: 'UNAVAILABLE', message: 'Automatic extraction could not read this document.' };
    }

    const result = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('')?.trim();
    if (!text) {
      return { status: 'UNAVAILABLE', message: 'Automatic extraction returned no readable data.' };
    }

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned) as unknown;
    } catch {
      return { status: 'UNAVAILABLE', message: 'Automatic extraction returned an unreadable response.' };
    }

    const data = normalizeAcademicPerformance(parsed);
    if (data.subjects.length === 0 && !data.studentName && !data.examinationYear) {
      return { status: 'UNAVAILABLE', message: 'No fields could be read clearly. The admissions team will review the original slip.' };
    }
    return { status: 'EXTRACTED', data };
  } catch (error) {
    console.warn('[Admissions OCR] Request failed:', error instanceof Error ? error.message : error);
    return { status: 'ERROR', message: 'Automatic extraction is temporarily unavailable.' };
  }
}
