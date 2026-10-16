import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  X,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowRight,
  Trash2,
  Undo2,
  Loader2,
  CalendarDays,
  Mic,
  MicOff,
} from 'lucide-react';
import { CalendarEvent, CalendarTheme, ChatMessage } from '../types/calendar';
import { formatTime12h, parseDate } from '../utils/dateUtils';

interface SpeechRecognitionResultItem {
  readonly 0: { transcript: string };
  readonly isFinal: boolean;
}

interface SpeechRecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultItem>;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onUndoAction?: (action: any) => void;
  onClearHistory: () => void;
  allEvents: CalendarEvent[];
  theme: CalendarTheme;
}

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  isLoading,
  onSelectEvent,
  onUndoAction,
  onClearHistory,
  allEvents,
  theme,
}) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      inputRef.current?.focus();
    } else {
      recognitionRef.current?.stop();
    }
  }, [messages, isOpen]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition =
      (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError('Voice input is not supported in this browser. Try Chrome or another browser with speech recognition.');
      return;
    }

    setSpeechError('');
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')
        .trim();
      const prefix = input.trim();
      setInput(prefix ? `${prefix} ${transcript}` : transcript);
    };
    recognition.onerror = (event) => {
      const errorMessage =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was denied. Allow microphone access in your browser to use voice input.'
          : event.error === 'no-speech'
            ? 'No speech was detected. Try speaking again.'
            : 'Voice input could not start. Check your microphone and try again.';
      setSpeechError(errorMessage);
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start voice input', error);
      recognitionRef.current = null;
      setIsListening(false);
      setSpeechError('Voice input could not start. Check your microphone and try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    await onSendMessage(text);
  };

  const handlePromptClick = (promptText: string) => {
    onSendMessage(promptText);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-full md:w-[420px] lg:w-[460px] h-full flex flex-col bg-slate-900 border-l border-slate-800 shadow-2xl relative z-20 flex-shrink-0 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-white">Chronos AI</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Natural Language Calendar Agent</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onClearHistory}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            title="Clear chat history"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            title="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Suggested Quick Starters */}
      <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80">
        <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          Quick commands:
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <button
            onClick={() => handlePromptClick('What meetings do I have on tuesday?')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-slate-700/80 whitespace-nowrap transition"
          >
            "What meetings do I have on tuesday?"
          </button>
          <button
            onClick={() => handlePromptClick('Schedule a call with Rob at 4:30')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-slate-700/80 whitespace-nowrap transition"
          >
            "Schedule a call with Rob at 4:30"
          </button>
          <button
            onClick={() => handlePromptClick('Do I have any free time on Wednesday?')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-slate-700/80 whitespace-nowrap transition"
          >
            "Free time on Wednesday?"
          </button>
          <button
            onClick={() => handlePromptClick('Find a time this week for a 30-minute meeting')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-slate-700/80 whitespace-nowrap transition"
          >
            "Find a time this week"
          </button>
        </div>
      </div>

      {theme === 'halloween' && (
        <div className="flex items-center justify-center gap-2 px-3 py-1 border-b border-slate-800 bg-orange-500/5">
          <img
            src="/halloween/ghost-with-pumpkin.png"
            alt=""
            aria-hidden="true"
            className="h-11 w-auto object-contain"
          />
          <span className="text-[11px] font-semibold tracking-wide text-orange-400">Happy Halloween</span>
          <img
            src="/halloween/ghost-sparkles.png"
            alt=""
            aria-hidden="true"
            className="h-11 w-auto object-contain"
          />
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs ${
                  isUser
                    ? 'bg-slate-700 text-slate-200'
                    : 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-slate-800/90 border border-slate-700/80 text-slate-200 rounded-tl-none'
                }`}
              >
                {/* Content body with simple markdown rendering */}
                <div className="whitespace-pre-wrap space-y-1">
                  {msg.content.split('\n').map((line, i) => {
                    // Check bold **text**
                    const parts = line.split(/(\*\*.*?\*\*)/g);
                    return (
                      <p key={i}>
                        {parts.map((part, pIdx) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return (
                              <strong key={pIdx} className="font-bold text-white">
                                {part.slice(2, -2)}
                              </strong>
                            );
                          }
                          return part;
                        })}
                      </p>
                    );
                  })}
                </div>

                {/* Conflict warning card */}
                {msg.conflictWarning && (
                  <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <span>{msg.conflictWarning}</span>
                  </div>
                )}

                {/* Applied actions summary card */}
                {msg.actionsApplied && msg.actionsApplied.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-700/60 space-y-2">
                    {msg.actionsApplied.map((act, actIdx) => (
                      <div
                        key={actIdx}
                        className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <div className="truncate">
                            <div className="font-semibold text-emerald-300 text-xs truncate">
                              {act.type === 'schedule' ? 'Scheduled: ' : act.type === 'update' ? 'Updated: ' : 'Deleted: '}
                              {act.eventTitle}
                            </div>
                            {act.details && (
                              <div className="text-[10px] text-slate-400 truncate">
                                {act.details}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Interactive view button */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {act.type !== 'delete' && (
                            <button
                              onClick={() => {
                                const matched = allEvents.find(e => e.title.toLowerCase() === act.eventTitle.toLowerCase());
                                if (matched) onSelectEvent(matched);
                              }}
                              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-indigo-300 hover:text-white border border-slate-700 transition"
                            >
                              View
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className={`text-[9px] mt-1 text-right ${isUser ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3 items-center text-slate-400">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl rounded-tl-none p-3 text-xs text-slate-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Checking schedule and coordinating with Gemini...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-slate-900/90">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about meetings or schedule an event..."
            disabled={isLoading}
            className="w-full pl-3.5 pr-20 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={toggleVoiceInput}
            disabled={isLoading}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={isListening}
            title={isListening ? 'Stop voice input' : 'Start voice input'}
            className={`absolute right-10 p-1.5 rounded-lg border transition disabled:opacity-30 ${
              isListening
                ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
            }`}
          >
            {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 transition shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className={`text-[10px] text-center mt-1.5 ${speechError ? 'text-rose-300' : isListening ? 'text-rose-300' : 'text-slate-400'}`} aria-live="polite">
          {speechError || (isListening
            ? 'Listening… Your speech will appear here; stop the microphone when finished.'
            : 'Try: "What meetings do I have on tuesday?" or "Schedule a call with Rob at 4:30"')}
        </p>
      </form>
    </aside>
  );
};
