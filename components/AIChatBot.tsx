import React, { useEffect, useRef, useState } from 'react';
import type { DailyEntry } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { isAIConfigured } from '../lib/gemini';
import {
  clearChatHistory,
  loadChatHistory,
  saveChatHistory,
  sendChatMessage,
  type ChatMessage,
} from '../lib/aiChat';
import { ChatIcon, CloseIcon } from './Icons';

interface AIChatBotProps {
  dailyData: Record<string, DailyEntry>;
}

interface ChatStrings {
  title: string;
  subtitle: string;
  greeting: string;
  placeholder: string;
  send: string;
  clear: string;
  close: string;
  open: string;
  typing: string;
  disclaimer: string;
  suggestions: string[];
}

const STRINGS: Record<string, ChatStrings> = {
  en: {
    title: 'Luna · AI Companion',
    subtitle: 'Mood & cycle support',
    greeting: "Hi, I'm Luna 💜 I can help with mood patterns, self-care ideas, or cycle questions. What's on your mind?",
    placeholder: 'Ask Luna anything…',
    send: 'Send',
    clear: 'Clear chat',
    close: 'Close chat',
    open: 'Open AI chat',
    typing: 'Luna is thinking…',
    disclaimer: 'Wellness support only — not medical advice.',
    suggestions: ['Why is my mood low?', 'Self-care idea for today', 'How can I track my cycle better?'],
  },
  es: {
    title: 'Luna · Compañera IA',
    subtitle: 'Apoyo de ánimo y ciclo',
    greeting: 'Hola, soy Luna 💜 Puedo ayudarte con patrones de ánimo, ideas de autocuidado o preguntas del ciclo. ¿Qué tienes en mente?',
    placeholder: 'Pregunta a Luna…',
    send: 'Enviar',
    clear: 'Borrar chat',
    close: 'Cerrar chat',
    open: 'Abrir chat IA',
    typing: 'Luna está pensando…',
    disclaimer: 'Solo apoyo de bienestar — no es consejo médico.',
    suggestions: ['¿Por qué mi ánimo está bajo?', 'Idea de autocuidado para hoy', '¿Cómo registro mejor mi ciclo?'],
  },
  'pt-BR': {
    title: 'Luna · Companheira IA',
    subtitle: 'Apoio de humor e ciclo',
    greeting: 'Oi, sou a Luna 💜 Posso ajudar com padrões de humor, ideias de autocuidado ou dúvidas do ciclo. O que está na sua mente?',
    placeholder: 'Pergunte à Luna…',
    send: 'Enviar',
    clear: 'Limpar chat',
    close: 'Fechar chat',
    open: 'Abrir chat IA',
    typing: 'Luna está pensando…',
    disclaimer: 'Apenas apoio de bem-estar — não é consejo médico.',
    suggestions: ['Por que meu humor está baixo?', 'Ideia de autocuidado para hoje', 'Como registrar melhor meu ciclo?'],
  },
  fr: {
    title: 'Luna · Compagnon IA',
    subtitle: "Soutien humeur & cycle",
    greeting: "Salut, je suis Luna 💜 Je peux aider avec les schémas d'humeur, des idées bien-être ou des questions sur le cycle. Qu'est-ce qui te préoccupe ?",
    placeholder: 'Demande à Luna…',
    send: 'Envoyer',
    clear: 'Effacer le chat',
    close: 'Fermer le chat',
    open: "Ouvrir le chat IA",
    typing: 'Luna réfléchit…',
    disclaimer: 'Soutien bien-être uniquement — pas un avis médical.',
    suggestions: ['Pourquoi mon humeur est basse ?', 'Idée bien-être pour aujourd’hui', 'Comment mieux suivre mon cycle ?'],
  },
};

function getStrings(language: string): ChatStrings {
  return STRINGS[language] ?? STRINGS.en;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const AIChatBot: React.FC<AIChatBotProps> = ({ dailyData }) => {
  const { language, isRTL } = useLanguage();
  const s = getStrings(language);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory());
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isOpen]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSend = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || isTyping) return;
    const userMsg: ChatMessage = { id: newId(), role: 'user', text, timestamp: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setIsTyping(true);
    try {
      const reply = await sendChatMessage(next, text, dailyData, language);
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: reply, timestamp: Date.now() }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', text: 'Sorry, something went wrong. Please try again in a moment.', timestamp: Date.now() },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    clearChatHistory();
  };

  return (
    <>
      {/* Floating action button — sits above the bottom tab bar */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label={s.open}
          className="fixed z-40 w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center ring-4 ring-purple-200"
          style={{
            bottom: 'calc(6rem + env(safe-area-inset-bottom))',
            ...(isRTL ? { left: '1rem' } : { right: '1rem' }),
          }}
        >
          <ChatIcon className="w-7 h-7" />
          {!isAIConfigured() && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full border-2 border-white" title="Offline mode" />
          )}
        </button>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-label={s.title}
          className="fixed z-40 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{
            bottom: 'calc(6rem + env(safe-area-inset-bottom))',
            ...(isRTL ? { left: '1rem' } : { right: '1rem' }),
            width: 'min(92vw, 380px)',
            height: 'min(70vh, 560px)',
          }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <ChatIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm leading-tight truncate">{s.title}</div>
              <div className="text-xs text-white/80 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isAIConfigured() ? 'bg-green-300' : 'bg-amber-300'}`} />
                {isAIConfigured() ? s.subtitle : `${s.subtitle} · offline`}
              </div>
            </div>
            <button
              onClick={handleClear}
              aria-label={s.clear}
              title={s.clear}
              className="text-white/80 hover:text-white text-xs font-semibold px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              {s.clear}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              aria-label={s.close}
              className="text-white hover:bg-white/10 rounded-full p-1.5 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gradient-to-b from-sky-50 to-white" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center text-xs shrink-0 font-bold">
                  L
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-3 py-2 text-sm text-slate-700 shadow-sm max-w-[85%]">
                  {s.greeting}
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="bg-purple-600 text-white rounded-2xl rounded-br-md px-3 py-2 text-sm shadow-sm max-w-[85%] break-words">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center text-xs shrink-0 font-bold">
                    L
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-3 py-2 text-sm text-slate-700 shadow-sm max-w-[85%] break-words whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
              ),
            )}
            {isTyping && (
              <div className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center text-xs shrink-0 font-bold">
                  L
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-3 py-2.5 shadow-sm flex gap-1" aria-label={s.typing}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length < 3 && (
            <div className="px-3 pt-2 flex gap-2 overflow-x-auto shrink-0 bg-white">
              {s.suggestions.map((tip) => (
                <button
                  key={tip}
                  onClick={() => handleSend(tip)}
                  disabled={isTyping}
                  className="whitespace-nowrap text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 disabled:opacity-50 rounded-full px-3 py-1.5 transition-colors"
                >
                  {tip}
                </button>
              ))}
            </div>
          )}

          {/* Disclaimer */}
          <div className="px-3 pt-1.5 bg-white shrink-0">
            <p className="text-[11px] text-slate-400 text-center leading-tight">{s.disclaimer}</p>
          </div>

          {/* Input */}
          <form
            className="p-3 bg-white flex gap-2 shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={s.placeholder}
              aria-label={s.placeholder}
              maxLength={500}
              disabled={isTyping}
              className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm text-slate-700 border-2 border-transparent focus:ring-2 focus:ring-purple-400 focus:bg-white focus:border-transparent outline-none transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              aria-label={s.send}
              className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
};
