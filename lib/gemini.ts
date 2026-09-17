import { GoogleGenAI } from '@google/genai';

function getApiKey(): string {
  return (process.env.API_KEY as string) || (process.env.GEMINI_API_KEY as string) || '';
}

/** True when a Gemini API key is configured (vite defines process.env.API_KEY). */
export function isAIConfigured(): boolean {
  return getApiKey().length > 0;
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('AI is not configured. Set GEMINI_API_KEY to enable the chat bot.');
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * Generates content using the Gemini API.
 * @param prompt The text prompt to send to the model.
 * @returns The generated text response.
 */
export async function generateContent(prompt: string): Promise<string> {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const text = response.text;
    if (!text || !text.trim()) {
      throw new Error('Empty response from AI model.');
    }
    return text;
  } catch (error) {
    console.error('Error generating content with Gemini:', error);
    // Re-throwing a more generic error to be handled by the caller.
    throw new Error('Failed to generate content from AI model.');
  }
}
