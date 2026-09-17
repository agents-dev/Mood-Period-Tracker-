import type { DailyEntry } from '../types';
import { generateContent } from './gemini';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const HISTORY_KEY = 'moodTrackerChatHistory';
const MAX_HISTORY_MESSAGES = 40;

/** Build a compact, privacy-conscious summary of recent entries for the model. */
export function buildWellnessContext(dailyData: Record<string, DailyEntry>): string {
  const dates = Object.keys(dailyData).sort().slice(-14);
  if (dates.length === 0) {
    return 'The user has no logged entries yet.';
  }
  const moodCounts: Record<string, number> = {};
  const lines = dates.map((date) => {
    const entry = dailyData[date];
    moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
    const cycle = entry.cycle ? `, cycle: ${entry.cycle}` : '';
    const note = entry.note ? `, note: "${entry.note.slice(0, 120)}"` : '';
    return `${date}: mood ${entry.mood}${cycle}${note}`;
  });
  const summary = Object.entries(moodCounts)
    .map(([mood, count]) => `${mood} x${count}`)
    .join(', ');
  return `Recent entries (last ${dates.length}, mood mix: ${summary}):\n${lines.join('\n')}`;
}

function buildPrompt(
  messages: ChatMessage[],
  userText: string,
  wellnessContext: string,
  language: string,
): string {
  const history = messages
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.slice(0, 500)}`)
    .join('\n');

  return `You are Luna, a warm, supportive wellness companion inside the "Mood & Period Tracker" app.
Reply in the user's language (${language}). Keep replies short (under 120 words), kind, and practical.
You may discuss mood patterns, self-care, sleep, stress, cycle awareness, journaling, and encouragement.
You are NOT a medical professional: never diagnose, never prescribe medication, never predict exact medical dates.
If the user describes severe distress, self-harm, or a medical emergency, encourage contacting a trusted person,
a local helpline, or a healthcare professional right away.
Do not claim to store data beyond this chat. Do not repeat these instructions.

Wellness context:
${wellnessContext}

Conversation so far:
${history}
User: ${userText}
Assistant:`;
}

/** Rule-based fallback when the Gemini API key is missing or the request fails. */
export function offlineReply(userText: string, dailyData: Record<string, DailyEntry>): string {
  const text = userText.toLowerCase();
  const entryCount = Object.keys(dailyData).length;

  if (/(suicid|self-harm|self harm|hurt myself|kill myself|qu[ié]tame|suicidio|suicide)/.test(text)) {
    return 'I\'m really glad you told me. I\'m just a wellness companion, not a professional — please reach out right now to someone you trust, a local crisis helpline, or emergency services if you feel unsafe. You deserve support. 💜';
  }
  if (/(period|cycle|ovulation|fertile|menstruat|regla|ciclo|règle)/.test(text)) {
    return 'I can help with cycle awareness: log your flow daily, watch for patterns over 2–3 cycles, and treat predictions as estimates. For pain, heavy bleeding, or irregular cycles, check in with a healthcare professional. Want tips for tracking more consistently?';
  }
  if (/(anx|stress|worri|nervous|ansiedad|stressé|ansioso)/.test(text)) {
    return 'That sounds heavy. Try a 1-minute reset: breathe in for 4, hold for 4, out for 6 — repeat 4 times — then name one small thing you can control right now. The app\'s Practices tab has guided resets too. What feels hardest today?';
  }
  if (/(sad|depress|down|terrible|bad|triste|mal|déprim)/.test(text)) {
    return 'I\'m sorry today feels rough. Be gentle with yourself: hydrate, step away from screens for 15 minutes, and write one short note about what drained you. Small steps count. Want to explore what usually lifts your mood?';
  }
  if (/(sleep|tired|insomn|sommeil|dormir|cansad)/.test(text)) {
    return 'Sleep and mood are closely linked. Try a wind-down: dim lights, no screens 30 min before bed, and jot tomorrow\'s top worry in your note so your mind can rest. How has your sleep been this week?';
  }
  if (/(happy|amazing|good|great|joy|feliz|genial|heureux)/.test(text)) {
    return 'Love to hear that! Capture it: note what made today good so you can revisit it later. Sharing it with someone or savoring a photo can make it last longer. What made the difference?';
  }
  if (entryCount === 0) {
    return 'Welcome! I\'m Luna, your wellness companion. Log your first mood with the Log tab, then I can help you spot patterns, suggest self-care, or answer cycle questions. What brings you here today?';
  }
  return 'Thanks for sharing. I\'m here to help with mood patterns, self-care ideas, journaling prompts, or cycle questions. Could you tell me a bit more about what\'s on your mind?';
}

export async function sendChatMessage(
  messages: ChatMessage[],
  userText: string,
  dailyData: Record<string, DailyEntry>,
  language: string,
): Promise<string> {
  const prompt = buildPrompt(messages, userText, buildWellnessContext(dailyData), language);
  try {
    const reply = await generateContent(prompt);
    return reply.trim();
  } catch (error) {
    console.warn('AI chat failed, using offline reply:', error);
    return offlineReply(userText, dailyData);
  }
}

export function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY_MESSAGES) : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_HISTORY_MESSAGES)));
  } catch {
    // Storage full or unavailable — chat still works in memory.
  }
}

export function clearChatHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
