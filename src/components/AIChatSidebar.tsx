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
  Clock,
  ArrowRight,
  Trash2,
  Loader2,
  MapPin,
} from 'lucide-react';
import { ChronosLogo } from './ChronosLogo';
import { CalendarEvent, ChatMessage } from '../types/calendar';
import { formatTime12h, parseDate } from '../utils/dateUtils';
import type { LocationState } from '../utils/useLocation';

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onClearHistory: () => void;
  allEvents: CalendarEvent[];
  locationState: LocationState;
  onRequestLocation: () => void;
}

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  isLoading,
  onSelectEvent,
  onClearHistory,
  allEvents,
  locationState,
  onRequestLocation,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [messages, isOpen]);

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
    <aside className="w-full md:w-[420px] lg:w-[460px] h-full flex flex-col bg-white border-l border-gray-200 shadow-xl relative z-20 flex-shrink-0 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ChronosLogo size={32} />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-gray-900">Daylie AI</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Active
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onClearHistory}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Clear chat history"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Location pill — only shown when not yet granted */}
      {(locationState.status === 'idle' || locationState.status === 'pending' || locationState.status === 'denied') && (
        <div className="px-4 pt-2 pb-0">
          {locationState.status === 'idle' || locationState.status === 'pending' ? (
            <button
              onClick={onRequestLocation}
              disabled={locationState.status === 'pending'}
              className="w-full flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-indigo-500 transition py-1"
            >
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {locationState.status === 'pending' ? 'Getting location…' : 'Enable location for weather forecasts'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 py-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              Location unavailable — include a city in your question
            </div>
          )}
        </div>
      )}

      {/* Quick prompts */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="text-[11px] font-semibold text-gray-400 mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          Quick commands:
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <button
            onClick={() => handlePromptClick('What meetings do I have today?')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 whitespace-nowrap transition"
          >
            "What meetings do I have today?"
          </button>
          <button
            onClick={() => handlePromptClick('Schedule a call with Rob at 4:30')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 whitespace-nowrap transition"
          >
            "Schedule a call with Rob at 4:30"
          </button>
          <button
            onClick={() => handlePromptClick('Do I have any free time on Wednesday?')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 whitespace-nowrap transition"
          >
            "Free time on Wednesday?"
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50/40">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs ${
                    isUser
                      ? 'bg-gray-200 text-gray-600'
                      : 'bg-gray-800 text-white'
                  }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-gray-900 text-white rounded-tr-none'
                    : 'bg-white border border-gray-200 text-gray-700 rounded-tl-none'
                }`}
              >
                <div className="whitespace-pre-wrap space-y-1">
                  {msg.content.split('\n').map((line, i) => {
                    const parts = line.split(/(\*\*.*?\*\*)/g);
                    return (
                      <p key={i}>
                        {parts.map((part, pIdx) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return (
                              <strong key={pIdx} className="font-bold text-gray-900">
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

                {/* Conflict warning */}
                {msg.conflictWarning && (
                  <div className="mt-2 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span>{msg.conflictWarning}</span>
                  </div>
                )}

                {/* Applied actions */}
                {msg.actionsApplied && msg.actionsApplied.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100 space-y-2">
                    {msg.actionsApplied.map((act, actIdx) => (
                      <div
                        key={actIdx}
                        className="p-2.5 rounded-xl bg-gray-50 border border-emerald-200 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <div className="truncate">
                            <div className="font-semibold text-emerald-700 text-xs truncate">
                              {act.type === 'schedule' ? 'Scheduled: ' : act.type === 'update' ? 'Updated: ' : 'Deleted: '}
                              {act.eventTitle}
                            </div>
                            {act.details && (
                              <div className="text-[10px] text-gray-400 truncate">{act.details}</div>
                            )}
                          </div>
                        </div>

                        {act.type !== 'delete' && (
                          <button
                            onClick={() => {
                              const matched = allEvents.find(e => e.title.toLowerCase() === act.eventTitle.toLowerCase());
                              if (matched) onSelectEvent(matched);
                            }}
                            className="px-2 py-1 rounded-md bg-white hover:bg-gray-100 text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 border border-gray-200 transition"
                          >
                            View
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className={`text-[9px] mt-1 text-right ${isUser ? 'text-indigo-200' : 'text-gray-400'}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading */}
        {isLoading && (
          <div className="flex gap-3 items-center text-gray-400">
            <div className="w-7 h-7 rounded-lg bg-gray-800 text-white flex items-center justify-center flex-shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-3 text-xs text-gray-500 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Thinking…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 bg-white">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about weather, meetings, or schedule an event..."
            disabled={isLoading}
            className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-30 transition shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </aside>
  );
};
