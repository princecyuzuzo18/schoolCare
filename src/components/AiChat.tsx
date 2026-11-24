import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowUp, BookOpen, Check, ClipboardCopy, FileText, Globe, MessageSquarePlus,
  Mic, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, Trash2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { api, ApiError } from '../services/api';
import type { AiConversation, AiMessage, AiStatus, LanguageCode } from '../types';

const WELCOME_EN = 'Hello! I am SchoolCare AI Assistant. I am here to help you with school management, teaching, learning, academic information and school-related questions. How can I help you today?';
const WELCOME_RW = 'Muraho! Ndi SchoolCare AI Assistant. Ndi hano kugira ngo ngufashe mu bijyanye n\'imicungire y\'ishuri, imyigishirize, imyigire, amakuru y\'amasomo n\'ibindi bibazo bijyanye n\'ishuri. Nakugirira iki uyu munsi?';

type LanguageChoice = 'auto' | LanguageCode;

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={index} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-blue-800">{part.slice(1, -1)}</code>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/** Small, safe formatter for headings, lists and fenced code (no raw HTML). */
function MessageText({ text }: { text: string }) {
  const lines = (text || '').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: Array<{ ordered: boolean; content: string }> = [];
  let code: string[] | null = null;

  const flushList = () => {
    if (!list.length) return;
    const ordered = list[0].ordered;
    const items = list.map(item => item.content);
    blocks.push(ordered
      ? <ol key={`list-${blocks.length}`} className="ml-5 list-decimal space-y-1">{items.map((item, i) => <li key={i}><InlineText text={item} /></li>)}</ol>
      : <ul key={`list-${blocks.length}`} className="ml-5 list-disc space-y-1">{items.map((item, i) => <li key={i}><InlineText text={item} /></li>)}</ul>);
    list = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith('```')) {
      if (code) {
        blocks.push(<pre key={`code-${index}`} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100"><code>{code.join('\n')}</code></pre>);
        code = null;
      } else {
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const size = heading[1].length <= 2 ? 'text-sm font-bold' : 'text-sm font-semibold';
      blocks.push(<p key={`h-${index}`} className={`${size} mt-2 text-slate-900`}><InlineText text={heading[2]} /></p>);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      list.push({ ordered: Boolean(numbered), content: (bullet || numbered)![1] });
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    blocks.push(<p key={`p-${index}`} className="leading-relaxed"><InlineText text={line} /></p>);
  }
  flushList();
  if (code) blocks.push(<pre key="code-tail" className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100"><code>{code.join('\n')}</code></pre>);

  return <div className="space-y-1 text-sm">{blocks}</div>;
}

interface AiChatProps {
  compact?: boolean;
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
}

export default function AiChat({ compact = false, initialPrompt, onInitialPromptConsumed }: AiChatProps) {
  const { role } = useAuth();
  const { t, language: uiLanguage, setLanguage: setUiLanguage } = useLanguage();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<LanguageChoice>('auto');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastPromptRef = useRef('');
  const consumedPromptRef = useRef<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const responseLanguage = useMemo((): LanguageCode => {
    if (choice !== 'auto') return choice;
    return uiLanguage === 'rw' || status?.defaultLanguage === 'rw' ? 'rw' : 'en';
  }, [choice, uiLanguage, status]);

  const welcome = responseLanguage === 'rw' ? WELCOME_RW : WELCOME_EN;

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await api.listAiConversations());
    } catch {
      // Conversation list is optional; the chat still works.
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.getAiStatus(), api.listAiConversations()]).then(([statusResult, conversationsResult]) => {
      if (!active) return;
      if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
      if (conversationsResult.status === 'fulfilled') setConversations(conversationsResult.value);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, error]);

  const openConversation = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError('');
      const conversation = await api.getAiConversation(id);
      setActiveId(conversation.id);
      setMessages(conversation.messages || []);
      setFeedback(conversation.feedback || {});
      setChoice(conversation.language === 'rw' ? 'rw' : 'en');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('aiErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const startNew = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setFeedback({});
    setError('');
    setInput('');
  }, []);

  const removeConversation = useCallback(async (id: string) => {
    if (!window.confirm(t('aiDeleteConversation') + '?')) return;
    try {
      await api.deleteAiConversation(id);
      if (activeId === id) startNew();
      await refreshConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('aiErrorGeneric'));
    }
  }, [activeId, refreshConversations, startNew, t]);

  const send = useCallback(async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    lastPromptRef.current = question;
    setInput('');
    setLoading(true);
    setError('');
    try {
      const result = await api.sendAiChat({
        message: question,
        conversationId: activeId || undefined,
        language: choice === 'auto' ? undefined : choice
      });
      setActiveId(result.conversationId);
      setMessages(previous => [...previous, ...result.messages]);
      if (!activeId) await refreshConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('aiErrorGeneric'));
      setInput(question);
    } finally {
      setLoading(false);
    }
  }, [activeId, choice, input, loading, refreshConversations, t]);

  useEffect(() => {
    if (!initialPrompt || consumedPromptRef.current === initialPrompt) return;
    consumedPromptRef.current = initialPrompt;
    setInput(initialPrompt);
    void send(initialPrompt);
    onInitialPromptConsumed?.();
  }, [initialPrompt, onInitialPromptConsumed, send]);

  const regenerate = useCallback(async (message: AiMessage) => {
    setBusyId(message.id);
    setError('');
    try {
      const result = await api.regenerateAiResponse(message.id);
      setMessages(previous => previous.map(item => item.id === message.id ? result.message : item));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('aiErrorGeneric'));
    } finally {
      setBusyId(null);
    }
  }, [t]);

  const giveFeedback = useCallback(async (message: AiMessage, helpful: boolean) => {
    try {
      await api.sendAiFeedback(message.id, helpful);
      setFeedback(previous => ({ ...previous, [message.id]: helpful ? 'helpful' : 'not_helpful' }));
    } catch {
      setError(t('aiErrorGeneric'));
    }
  }, [t]);

  const copy = useCallback(async (message: AiMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setError(t('aiErrorGeneric'));
    }
  }, [t]);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(t('aiVoiceUnsupported'));
      return;
    }
    if (voiceListening) {
      recognitionRef.current?.stop();
      setVoiceListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = responseLanguage === 'rw' ? 'rw-RW' : 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setInput(previous => `${previous}${previous ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = () => setVoiceListening(false);
    recognition.onend = () => setVoiceListening(false);
    recognitionRef.current = recognition;
    setVoiceListening(true);
    try {
      recognition.start();
    } catch {
      setVoiceListening(false);
    }
  }, [responseLanguage, t, voiceListening]);

  const statusLabel = status?.available ? t('aiAvailable') : status?.enabled === false ? t('aiDisabled') : t('aiUnavailable');
  const suggestions = status?.suggestions || [];

  return (
    <div className={`flex min-h-0 flex-col bg-[var(--schoolcare-page-bg)] ${compact ? 'h-full' : 'h-[72vh] min-h-[520px]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--schoolcare-border)] bg-white px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Sparkles size={17} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[color:var(--schoolcare-brand-700)]">{t('aiTitle')}</p>
            {!compact && <p className="hidden truncate text-[11px] text-slate-500 sm:block">{t('aiTagline')}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${status?.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status?.available ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {statusLabel}
          </span>
          <button type="button" onClick={startNew} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-50" title={t('aiNewConversation')}>
            <MessageSquarePlus size={14} /><span className={compact ? 'hidden sm:inline' : ''}>{t('aiNewConversation')}</span>
          </button>
        </div>
      </div>

      {status && !status.available && status.reason && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{status.reason} {/(GEMINI_API_KEY|OPENAI_API_KEY)/.test(status.reason) ? 'Ask an administrator to configure it on the server.' : ''}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!compact && (
          <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--schoolcare-border)] bg-white/70 lg:flex">
            <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600">
              <span>{t('aiConversations')}</span>
              <button type="button" onClick={startNew} className="rounded p-1 hover:bg-blue-50" title={t('aiNewConversation')}><MessageSquarePlus size={14} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {conversations.length === 0 && <p className="px-2 py-3 text-xs text-slate-500">{t('aiNoConversations')}</p>}
              {conversations.map(conversation => (
                <div key={conversation.id} className={`group mb-1 flex items-center gap-1 rounded-lg px-2 py-2 ${activeId === conversation.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-100'}`}>
                  <button type="button" onClick={() => void openConversation(conversation.id)} className="min-w-0 flex-1 truncate text-left text-xs">
                    <FileText size={12} className="mr-1 inline" />{conversation.title}
                  </button>
                  <button type="button" onClick={() => void removeConversation(conversation.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title={t('aiDeleteConversation')}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--schoolcare-border)] px-3 py-2 text-[10px] text-slate-500">
              {t('aiSettingsRetention')}: {status?.retentionDays || 180} {t('aiKnowledgeStatus') === 'Status' ? 'days' : 'iminsi'}
            </div>
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            {messages.length === 0 && (
              <div className="mx-auto max-w-2xl">
                <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-800"><Sparkles size={16} />{t('aiTitle')}</div>
                  <p className="text-sm leading-relaxed text-slate-700">{welcome}</p>
                </div>
                {suggestions.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('aiSuggestedQuestions')}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {suggestions.map(question => (
                        <button key={question} type="button" onClick={() => void send(question)} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-left text-xs text-blue-800 transition hover:border-blue-300 hover:bg-blue-50">
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map(message => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] rounded-2xl px-3 py-2.5 shadow-sm sm:max-w-[85%] ${message.role === 'user' ? 'brand-gradient text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                    <MessageText text={message.content} />
                    {message.role === 'assistant' && (
                      <>
                        {message.sources.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                            <span className="text-[10px] font-semibold text-slate-500">{t('aiSources')}:</span>
                            {message.sources.map((source, index) => (
                              <span key={`${source.title}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
                                {source.kind === 'DOCUMENT' ? <BookOpen size={10} /> : <Globe size={10} />}{source.title}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                          <button type="button" onClick={() => void copy(message)} className="rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100" title={t('aiCopy')}>
                            {copiedId === message.id ? <Check size={13} className="text-emerald-600" /> : <ClipboardCopy size={13} />}
                          </button>
                          <button type="button" onClick={() => void regenerate(message)} disabled={busyId === message.id} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 disabled:opacity-50" title={t('aiRegenerate')}>
                            <RefreshCw size={13} className={busyId === message.id ? 'animate-spin' : ''} />{t('aiRegenerate')}
                          </button>
                          <button type="button" onClick={() => void giveFeedback(message, true)} className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] ${feedback[message.id] === 'helpful' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'}`} title={t('aiHelpful')}>
                            <ThumbsUp size={13} />{t('aiHelpful')}
                          </button>
                          <button type="button" onClick={() => void giveFeedback(message, false)} className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] ${feedback[message.id] === 'not_helpful' ? 'bg-red-50 text-red-700' : 'text-slate-500 hover:bg-slate-100'}`} title={t('aiNotHelpful')}>
                            <ThumbsDown size={13} />{t('aiNotHelpful')}
                          </button>
                          <span className="ml-auto text-[10px] text-slate-400">{formatTime(message.createdAt)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:300ms]" />
                      <span className="ml-2 text-xs text-slate-500">{t('aiThinking')}</span>
                    </div>
                  </div>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span className="flex-1">{error}</span>
                  {lastPromptRef.current && (
                    <button type="button" onClick={() => void send(lastPromptRef.current)} className="inline-flex items-center gap-1 font-semibold underline">
                      <RefreshCw size={12} />{t('aiRetry')}
                    </button>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-[var(--schoolcare-border)] bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <Globe size={13} />{t('aiLanguage')}
                <select
                  value={choice}
                  onChange={event => {
                    const value = event.target.value as LanguageChoice;
                    setChoice(value);
                    if (value !== 'auto' && value !== uiLanguage) setUiLanguage(value);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                >
                  <option value="auto">{t('aiAutomatic')}</option>
                  <option value="en">English</option>
                  <option value="rw">Kinyarwanda</option>
                </select>
              </label>
              <span className="ml-auto rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">{role || ''}</span>
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={compact ? 2 : 3}
                maxLength={4000}
                placeholder={t('aiTypeQuestion')}
                className="max-h-40 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button type="button" onClick={toggleVoice} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${voiceListening ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'}`} title={t('aiVoiceInput')}>
                <Mic size={17} />
              </button>
              <button type="button" onClick={() => void send()} disabled={!input.trim() || loading} className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                <ArrowUp size={16} />{t('aiSend')}
              </button>
            </div>
            {compact && (
              <p className="mt-1 text-center text-[10px] text-slate-400">{t('aiContextNote')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
