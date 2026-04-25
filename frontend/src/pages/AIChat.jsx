import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import {
  Loader2,
  AlertTriangle,
  Send,
  Trash2,
  Plus,
  MessageSquare,
  Bot,
  User,
  CheckCircle,
  XCircle,
  ChevronDown,
  Shield,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
} from 'lucide-react';

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function AIChat() {
  const { isAdmin, user } = useAuth();

  // Messages
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Input
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Confirming action
  const [confirmingAction, setConfirmingAction] = useState(null);
  const [confirming, setConfirming] = useState(false);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Refs
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // ── Scroll to bottom ──────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ── Fetch history ─────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/ai/chat/history?page=1&limit=50');
      const data = res.data || {};
      const msgs = data.messages || [];
      // API returns newest first; reverse for chronological display
      setMessages(msgs.reverse());
    } catch (err) {
      setError(err.message || 'Failed to load chat history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // ── Send message ──────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    // Optimistically add user message
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput('');
    setSending(true);
    setError(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await api.post('/ai/chat/message', { message: trimmed });
      const data = res.data || {};

      // Add assistant message
      const assistantMsg = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: data.message || '',
        actions: data.actions || [],
        needsConfirmation: data.needsConfirmation || false,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.needsConfirmation && data.actions?.length) {
        setConfirmingAction(data.actions[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to send message.');
      // Remove the optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Auto-resize textarea ──────────────────────────────────────────

  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  };

  // ── Confirm action ────────────────────────────────────────────────

  const handleConfirmAction = async (action) => {
    setConfirming(true);
    setError(null);
    try {
      const res = await api.post('/ai/chat/confirm-action', { action });
      const data = res.data || {};

      const confirmMsg = {
        id: `confirm-${Date.now()}`,
        role: 'assistant',
        content: data.message || 'Action confirmed and executed.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
      setConfirmingAction(null);
    } catch (err) {
      setError(err.message || 'Failed to confirm action.');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelAction = () => {
    setConfirmingAction(null);
    const cancelMsg = {
      id: `cancel-${Date.now()}`,
      role: 'assistant',
      content: 'Action cancelled. No changes were made.',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, cancelMsg]);
  };

  // ── Clear history ─────────────────────────────────────────────────

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all chat history? This cannot be undone.')) return;
    try {
      await api.delete('/ai/chat/history');
      setMessages([]);
      setConfirmingAction(null);
    } catch (err) {
      setError(err.message || 'Failed to clear history.');
    }
  };

  // ── Admin guard ──────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Admin access required to use AI Chat.</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-8rem)] -mt-2">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="w-64 flex-shrink-0 flex flex-col" style={{ background: 'rgba(255,255,255,0.45)', borderRight: '1px solid rgba(139,92,246,0.08)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid rgba(139,92,246,0.08)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">AI Chat</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 text-gray-400 hover:text-brand-600 rounded-xl hover:bg-brand-50 transition-all duration-200"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <button
              onClick={() => {
                handleClearHistory();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-brand-50/50 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>

          <div className="p-3" style={{ borderTop: '1px solid rgba(139,92,246,0.08)' }}>
            <button
              onClick={handleClearHistory}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-500 hover:bg-red-50/50 transition-all duration-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear History
            </button>
          </div>
        </div>
      )}

      {/* ── Main Chat Area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 glass"  >
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-gray-400 hover:text-brand-600 rounded-xl hover:bg-brand-50 transition-all duration-200"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-800">AI Assistant</h1>
              <p className="text-[11px] text-gray-400">Manage brands, campaigns, and more</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                <p className="text-xs text-gray-400">Loading history...</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-brand-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Start a conversation</h2>
              <p className="text-sm text-gray-500 max-w-md">
                Ask me to update brand prompts, modify campaigns, generate subject lines, review performance, or manage your email outreach.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  'Generate 5 subject lines for my latest campaign',
                  'Review bounce rates across all brands',
                  'Update the AI prompt for Acme brand',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      textareaRef.current?.focus();
                    }}
                    className="px-3 py-2 rounded-xl text-xs text-gray-700 transition-all duration-200 hover:shadow-sm" style={{ background: 'rgba(139,92,246,0.06)' }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id || msg._id}
                  message={msg}
                  userName={user?.name || 'You'}
                />
              ))}

              {/* Action confirmation card */}
              {confirmingAction && (
                <div className="max-w-2xl ml-12">
                  <ActionCard
                    action={confirmingAction}
                    onConfirm={() => handleConfirmAction(confirmingAction)}
                    onCancel={handleCancelAction}
                    confirming={confirming}
                  />
                </div>
              )}

              {/* Sending indicator */}
              {sending && (
                <div className="flex items-start gap-3 max-w-2xl">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <Bot className="w-4 h-4 text-brand-500" />
                  </div>
                  <div className="rounded-2xl rounded-tl-md px-4 py-3" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.35)' }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 p-3 rounded-xl text-xs text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {/* Input area */}
        <div className="glass px-4 py-3">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to update brand prompts, modify campaigns, generate subject lines..."
                rows={1}
                className="input-field resize-none !py-2.5 !pr-12 min-h-[42px] max-h-[160px]"
              />
              <div className="absolute right-2 bottom-1.5 text-[10px] text-gray-400">
                Ctrl+Enter
              </div>
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="btn-primary !p-2.5 flex-shrink-0"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chat Message Component ───────────────────────────────────────────

function ChatMessage({ message, userName }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={isUser
          ? { background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }
          : { background: 'rgba(139,92,246,0.1)' }
        }
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-brand-500" />
        )}
      </div>

      {/* Message content */}
      <div className={`max-w-2xl ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'text-white rounded-tr-md'
              : 'text-gray-800 rounded-tl-md'
          }`}
          style={isUser
            ? { background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: '0 4px 15px rgba(124,58,237,0.25)' }
            : { background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.35)' }
          }
        >
          <div
            className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
              isUser ? 'text-white' : 'text-gray-800'
            }`}
          >
            {message.content}
          </div>
        </div>

        {/* Timestamp */}
        <div className={`flex items-center gap-2 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-400">
            {message.createdAt
              ? format(new Date(message.createdAt), 'HH:mm')
              : ''}
          </span>
          {!isUser && message.actionsTaken?.length > 0 && (
            <span className="text-[10px] text-green-500 flex items-center gap-0.5">
              <CheckCircle className="w-3 h-3" />
              {message.actionsTaken.length} action{message.actionsTaken.length !== 1 ? 's' : ''} taken
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Action Confirmation Card ─────────────────────────────────────────

function ActionCard({ action, onConfirm, onCancel, confirming }) {
  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-amber-900 mb-1">Action Requires Confirmation</h4>
          <p className="text-sm text-amber-800">
            {action.description || action.type || 'The AI wants to perform an action.'}
          </p>
          {action.details && (
            <pre className="mt-2 text-xs bg-white p-2.5 rounded-lg border border-amber-200 overflow-x-auto font-mono text-gray-700 max-h-32">
              {typeof action.details === 'string'
                ? action.details
                : JSON.stringify(action.details, null, 2)}
            </pre>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="btn-primary btn-sm flex items-center gap-1.5 !bg-amber-600 hover:!bg-amber-700"
            >
              {confirming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              {confirming ? 'Confirming...' : 'Confirm'}
            </button>
            <button
              onClick={onCancel}
              disabled={confirming}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
