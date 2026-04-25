import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Loader2, AlertTriangle, MessageSquare, Send, Inbox,
  ArrowDownLeft, ArrowUpRight, User, Mail, CheckCheck,
  Calendar, TrendingUp, X, Clock, Tag, ChevronDown,
  Reply, Archive, ExternalLink, MoreHorizontal, Keyboard,
  BookOpen,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const FOLDERS = [
  { id: 'all',                 label: 'All',            icon: Inbox,          color: null },
  { id: 'unread',              label: 'Unread',         icon: Mail,           color: null },
  { id: 'interested',          label: 'Interested',     icon: TrendingUp,     color: 'text-green-600' },
  { id: 'meeting_booked',      label: 'Meeting Booked', icon: Calendar,       color: 'text-blue-600' },
  { id: 'not_interested',      label: 'Not Interested', icon: X,              color: 'text-red-500' },
  { id: 'out_of_office',       label: 'Out of Office',  icon: Clock,          color: 'text-amber-600' },
  { id: 'auto_reply',          label: 'Auto Reply',     icon: MessageSquare,  color: 'text-gray-500' },
  { id: 'unsubscribe_request', label: 'Unsubscribe',    icon: Archive,        color: 'text-rose-500' },
];

const CHIP = {
  interested:          { bg: 'bg-green-100 text-green-700',  label: 'Interested' },
  meeting_booked:      { bg: 'bg-blue-100 text-blue-700',    label: 'Meeting Booked' },
  not_interested:      { bg: 'bg-red-100 text-red-600',      label: 'Not Interested' },
  out_of_office:       { bg: 'bg-amber-100 text-amber-700',  label: 'OOO' },
  unsubscribe_request: { bg: 'bg-rose-100 text-rose-600',    label: 'Unsubscribe' },
  wrong_person:        { bg: 'bg-gray-100 text-gray-500',    label: 'Wrong Person' },
  auto_reply:          { bg: 'bg-gray-100 text-gray-500',    label: 'Auto Reply' },
};

const LABEL_SHORTCUTS = {
  '1': 'interested',
  '2': 'meeting_booked',
  '3': 'not_interested',
  '4': 'out_of_office',
  '5': 'unsubscribe_request',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function Replies() {
  // ── Data ─────────────────────────────────────────────────────────────────
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [templates, setTemplates] = useState([]);

  // ── Folder / filter ───────────────────────────────────────────────────────
  const [folder, setFolder] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [campaigns, setCampaigns] = useState([]);

  // ── Thread ────────────────────────────────────────────────────────────────
  const [threadGroups, setThreadGroups] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // ── Compose ───────────────────────────────────────────────────────────────
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);

  // ── Local label overrides (optimistic) ───────────────────────────────────
  const [labelOverrides, setLabelOverrides] = useState({});

  // ── Keyboard shortcut tooltip ─────────────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Mobile pane (0=folders, 1=threads, 2=detail) ─────────────────────────
  const [mobilePane, setMobilePane] = useState(1);

  const threadEndRef = useRef(null);
  const composeRef = useRef(null);
  const templateRef = useRef(null);

  // ── Fetch supporting data ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [cRes, tRes] = await Promise.all([
          api.get('/campaigns?limit=200'),
          api.get('/templates?limit=100').catch(() => ({ data: [] })),
        ]);
        setCampaigns(cRes.data?.campaigns || cRes.data || []);
        const tData = tRes.data?.templates || tRes.data || [];
        setTemplates(Array.isArray(tData) ? tData : []);
      } catch { /* non-critical */ }
    })();
  }, []);

  // ── Fetch unread count ────────────────────────────────────────────────────
  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.get('/replies/unread-count');
      setUnreadCount(res.data?.count || res.data?.data?.count || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  // ── Fetch replies ─────────────────────────────────────────────────────────
  const fetchReplies = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: 200 });
      if (campaignFilter) params.append('campaign_id', campaignFilter);
      const res = await api.get(`/replies?${params}`);
      const raw = res.data?.replies || res.data?.data?.replies || [];
      setReplies(raw);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load inbox.');
    } finally {
      setLoading(false);
    }
  }, [campaignFilter]);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  // ── Group into threads by lead ────────────────────────────────────────────
  useEffect(() => {
    const byLead = {};
    replies.forEach(r => {
      if (!byLead[r.leadId]) {
        byLead[r.leadId] = {
          leadId: r.leadId,
          leadName: r.leadName || r.leadEmail || 'Unknown Lead',
          leadEmail: r.leadEmail || r.fromEmail || '',
          brandName: r.brandName || '',
          brandId: r.brandId,
          campaignId: r.campaignId,
          smtpAccountId: r.smtpAccountId,
          messages: [],
          hasUnread: false,
          latestAt: 0,
          latestMsg: null,
          sentiment: null,
        };
      }
      const g = byLead[r.leadId];
      g.messages.push(r);
      const labelOverride = labelOverrides[r.leadId];
      // Use override sentiment if set, otherwise use the latest inbound's sentiment
      if (r.direction === 'inbound') {
        const ts = new Date(r.createdAt).getTime();
        if (ts > g.latestAt) {
          g.latestAt = ts;
          g.latestMsg = r;
          g.sentiment = labelOverride || r.sentiment;
        }
        if (!r.isRead) g.hasUnread = true;
      } else if (!g.latestMsg) {
        g.latestAt = new Date(r.createdAt).getTime();
        g.latestMsg = r;
      }
      if (labelOverride) g.sentiment = labelOverride;
    });

    // Apply overrides
    Object.entries(labelOverrides).forEach(([leadId, sent]) => {
      if (byLead[leadId]) byLead[leadId].sentiment = sent;
    });

    let groups = Object.values(byLead).sort((a, b) => b.latestAt - a.latestAt);

    // Filter by folder
    if (folder === 'unread') {
      groups = groups.filter(g => g.hasUnread);
    } else if (folder !== 'all') {
      groups = groups.filter(g => (labelOverrides[g.leadId] || g.sentiment) === folder);
    }

    setThreadGroups(groups);
    // Reset selection when folder changes
    setSelectedIdx(null);
    setSelectedGroup(null);
    setThreadMessages([]);
  }, [replies, folder, labelOverrides]);

  // ── Folder counts ─────────────────────────────────────────────────────────
  const folderCounts = useCallback(() => {
    const counts = {};
    const byLead = {};
    replies.forEach(r => {
      if (!byLead[r.leadId]) byLead[r.leadId] = { hasUnread: false, sentiment: null, latestAt: 0 };
      const g = byLead[r.leadId];
      const override = labelOverrides[r.leadId];
      if (r.direction === 'inbound') {
        const ts = new Date(r.createdAt).getTime();
        if (ts > g.latestAt) { g.latestAt = ts; g.sentiment = override || r.sentiment; }
        if (!r.isRead) g.hasUnread = true;
      }
      if (override) g.sentiment = override;
    });
    const groups = Object.values(byLead);
    counts.all = groups.length;
    counts.unread = groups.filter(g => g.hasUnread).length;
    FOLDERS.filter(f => f.id !== 'all' && f.id !== 'unread').forEach(f => {
      counts[f.id] = groups.filter(g => g.sentiment === f.id).length;
    });
    return counts;
  }, [replies, labelOverrides]);

  // ── Select thread ─────────────────────────────────────────────────────────
  const selectThread = useCallback(async (group, idx) => {
    setSelectedIdx(idx);
    setSelectedGroup(group);
    setThreadLoading(true);
    setThreadMessages([]);
    setReplyBody('');
    setSendError(null);
    setComposerOpen(true);
    setMobilePane(2);

    try {
      const res = await api.get(`/replies/thread/${group.leadId}`);
      const msgs = res.data?.messages || res.data?.data?.messages || [];
      setThreadMessages(msgs);

      // Mark inbound unread as read
      const unreadIds = msgs.filter(m => !m.isRead && m.direction === 'inbound').map(m => m.id);
      if (unreadIds.length) {
        for (const id of unreadIds) api.put(`/replies/${id}/read`).catch(() => {});
        fetchUnread();
        // Optimistically mark as read in local state
        setReplies(prev => prev.map(r => unreadIds.includes(r.id) ? { ...r, isRead: true } : r));
      }
    } catch {
      setError('Failed to load thread.');
    } finally {
      setThreadLoading(false);
    }
  }, [fetchUnread]);

  // Auto-scroll thread to bottom
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  // ── Label a thread ────────────────────────────────────────────────────────
  const labelThread = useCallback((group, sentiment) => {
    setLabelOverrides(prev => ({ ...prev, [group.leadId]: sentiment }));
    // Best-effort persist: try PATCH /replies/:leadId or similar
    api.put(`/replies/${group.latestMsg?.id}/label`, { sentiment }).catch(() => {});
  }, []);

  // ── Archive (mark read + remove from unread) ──────────────────────────────
  const archiveThread = useCallback(async (group) => {
    if (!group) return;
    const ids = (group.messages || []).filter(m => !m.isRead).map(m => m.id);
    for (const id of ids) api.put(`/replies/${id}/read`).catch(() => {});
    setReplies(prev => prev.map(r =>
      group.messages.some(m => m.id === r.id) ? { ...r, isRead: true } : r
    ));
    fetchUnread();
    setSelectedIdx(null);
    setSelectedGroup(null);
    setThreadMessages([]);
  }, [fetchUnread]);

  // ── Send reply ────────────────────────────────────────────────────────────
  const handleSendReply = useCallback(async () => {
    if (!replyBody.trim() || !selectedGroup || sending) return;
    setSending(true); setSendError(null);
    const latestInbound = [...threadMessages].reverse().find(m => m.direction === 'inbound');
    try {
      await api.post('/replies/send', {
        leadId: selectedGroup.leadId,
        brandId: selectedGroup.brandId,
        smtpAccountId: selectedGroup.smtpAccountId,
        subject: latestInbound?.subject ? `Re: ${latestInbound.subject}` : '',
        bodyHtml: `<p>${replyBody.replace(/\n/g, '</p><p>')}</p>`,
        bodyText: replyBody,
        inReplyTo: latestInbound?.messageId || latestInbound?.id,
      });
      setReplyBody('');
      const res = await api.get(`/replies/thread/${selectedGroup.leadId}`);
      setThreadMessages(res.data?.messages || res.data?.data?.messages || []);
      fetchReplies();
    } catch (e) {
      setSendError(e.response?.data?.message || e.message || 'Failed to send reply.');
    } finally {
      setSending(false);
    }
  }, [replyBody, selectedGroup, sending, threadMessages, fetchReplies]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Don't fire when typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const len = threadGroups.length;

      if (e.key === 'j') {
        // Next thread
        setSelectedIdx(prev => {
          const next = prev === null ? 0 : Math.min(prev + 1, len - 1);
          if (threadGroups[next]) selectThread(threadGroups[next], next);
          return next;
        });
      } else if (e.key === 'k') {
        // Prev thread
        setSelectedIdx(prev => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0);
          if (threadGroups[next]) selectThread(threadGroups[next], next);
          return next;
        });
      } else if (e.key === 'r' && selectedGroup) {
        // Focus compose
        e.preventDefault();
        setComposerOpen(true);
        setTimeout(() => composeRef.current?.focus(), 50);
      } else if (e.key === 'e' && selectedGroup) {
        // Archive
        archiveThread(selectedGroup);
      } else if (LABEL_SHORTCUTS[e.key] && selectedGroup) {
        // Label
        labelThread(selectedGroup, LABEL_SHORTCUTS[e.key]);
      } else if (e.key === '?') {
        setShowShortcuts(s => !s);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [threadGroups, selectedGroup, selectThread, archiveThread, labelThread]);

  // Close template dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (templateRef.current && !templateRef.current.contains(e.target)) setShowTemplates(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const counts = folderCounts();
  const activeGroup = selectedGroup;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 112px)' }}>
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-1 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">Inbox</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Campaign filter */}
          {campaigns.length > 0 && (
            <div className="relative hidden sm:block">
              <select
                value={campaignFilter}
                onChange={e => setCampaignFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg pl-2 pr-7 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-brand-400"
              >
                <option value="">All Campaigns</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          )}
          {unreadCount > 0 && (
            <button
              onClick={async () => { await api.put('/replies/mark-all-read').catch(() => {}); fetchReplies(); fetchUnread(); }}
              className="text-xs text-gray-600 hover:text-brand-600 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          )}
          <button
            onClick={() => setShowShortcuts(s => !s)}
            className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* ── Keyboard shortcut overlay ── */}
      {showShortcuts && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-800 mb-4">Keyboard shortcuts</h3>
            <div className="space-y-2">
              {[
                ['j', 'Next thread'],
                ['k', 'Previous thread'],
                ['r', 'Focus reply'],
                ['e', 'Archive thread'],
                ['1', 'Label: Interested'],
                ['2', 'Label: Meeting Booked'],
                ['3', 'Label: Not Interested'],
                ['4', 'Label: Out of Office'],
                ['5', 'Label: Unsubscribe'],
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{desc}</span>
                  <kbd className="px-2 py-0.5 text-xs font-mono text-gray-600 bg-gray-100 border border-gray-200 rounded">{key}</kbd>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-4 w-full text-sm text-center text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── 3-pane layout ── */}
      <div className="flex flex-1 min-h-0 rounded-xl overflow-hidden border border-gray-200/70 shadow-sm bg-white">
        {/* ────────────── PANE 1: Folders ────────────── */}
        <aside className={`w-48 flex-shrink-0 border-r border-gray-100 flex flex-col py-2 ${mobilePane !== 0 ? 'hidden lg:flex' : 'flex'}`}>
          <nav className="flex-1 px-2 space-y-0.5">
            {FOLDERS.map(f => {
              const Icon = f.icon;
              const count = counts[f.id] || 0;
              const isActive = folder === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setFolder(f.id); setMobilePane(1); }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-brand-600' : f.color || 'text-gray-400'}`} />
                    {f.label}
                  </span>
                  {count > 0 && (
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-brand-100 text-brand-700' : 'text-gray-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ────────────── PANE 2: Thread list ────────────── */}
        <div className={`w-72 flex-shrink-0 border-r border-gray-100 flex flex-col ${mobilePane !== 1 ? 'hidden lg:flex' : 'flex w-full lg:w-72'}`}>
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : threadGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-gray-400 gap-3">
              <Inbox className="w-10 h-10 text-gray-300" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">No conversations</p>
                <p className="text-xs mt-0.5">
                  {folder === 'all' ? 'Replies will appear here when prospects respond.' : `No ${folder.replace(/_/g, ' ')} threads.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {threadGroups.map((group, idx) => {
                const isSelected = selectedIdx === idx;
                const latest = group.latestMsg;
                const chip = CHIP[group.sentiment];
                return (
                  <button
                    key={group.leadId}
                    onClick={() => selectThread(group, idx)}
                    className={`w-full text-left px-3 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50/60 ${
                      isSelected ? 'bg-brand-50/70 border-l-2 border-l-brand-600' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Unread dot */}
                      <div className="pt-1.5 flex-shrink-0">
                        {group.hasUnread
                          ? <div className="w-2 h-2 rounded-full bg-brand-600" />
                          : <div className="w-2 h-2" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-sm truncate ${group.hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {group.leadName}
                          </span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {fmtDate(latest?.createdAt)}
                          </span>
                        </div>
                        {chip && (
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 mb-0.5 ${chip.bg}`}>
                            {chip.label}
                          </span>
                        )}
                        <p className={`text-xs mt-0.5 truncate leading-relaxed ${group.hasUnread ? 'text-gray-700' : 'text-gray-400'}`}>
                          {latest?.direction === 'inbound' && <ArrowDownLeft className="w-2.5 h-2.5 inline mr-0.5 text-green-500" />}
                          {latest?.direction === 'outbound' && <ArrowUpRight className="w-2.5 h-2.5 inline mr-0.5 text-gray-400" />}
                          {latest?.bodyText?.substring(0, 90) || latest?.subject || 'No content'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ────────────── PANE 3: Thread detail ────────────── */}
        <div className={`flex-1 flex flex-col min-w-0 ${mobilePane !== 2 ? 'hidden lg:flex' : 'flex'}`}>
          {!activeGroup ? (
            <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-3">
              <MessageSquare className="w-12 h-12 text-gray-200" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Select a conversation</p>
                <p className="text-xs mt-0.5">Use <kbd className="px-1 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-200 rounded">j</kbd> / <kbd className="px-1 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-200 rounded">k</kbd> to navigate</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Mobile back */}
                  <button
                    onClick={() => setMobilePane(1)}
                    className="lg:hidden text-gray-400 hover:text-gray-600 mr-1"
                  >
                    ←
                  </button>
                  <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{activeGroup.leadName}</p>
                      {CHIP[activeGroup.sentiment] && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CHIP[activeGroup.sentiment].bg}`}>
                          {CHIP[activeGroup.sentiment].label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{activeGroup.leadEmail}</p>
                  </div>
                </div>

                {/* Thread actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Campaign link */}
                  {activeGroup.campaignId && (
                    <Link
                      to={`/campaigns/${activeGroup.campaignId}`}
                      className="text-xs text-gray-500 hover:text-brand-600 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
                      title="View campaign"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Campaign
                    </Link>
                  )}

                  {/* Label dropdown */}
                  <LabelDropdown group={activeGroup} onLabel={labelThread} />

                  {/* Archive */}
                  <button
                    onClick={() => archiveThread(activeGroup)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Archive (e)"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {threadLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                  </div>
                ) : threadMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <MessageSquare className="w-8 h-8 text-gray-200" />
                    <p className="text-sm">No messages yet.</p>
                  </div>
                ) : (
                  threadMessages.map((msg) => {
                    const inbound = msg.direction === 'inbound';
                    return (
                      <div key={msg.id || msg._id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                          inbound
                            ? 'bg-gray-100 text-gray-900 rounded-bl-sm'
                            : 'bg-brand-600 text-white rounded-br-sm'
                        }`}>
                          <div className={`flex items-center gap-2 mb-1.5 ${inbound ? 'text-gray-500' : 'text-brand-200'}`}>
                            <span className="text-[11px] font-medium">
                              {inbound ? (msg.fromEmail || msg.leadName || 'Prospect') : (msg.fromEmail || 'You')}
                            </span>
                            <span className="text-[10px]">{fmtDate(msg.createdAt)}</span>
                          </div>
                          {msg.subject && (
                            <p className={`text-xs font-semibold mb-1 ${inbound ? 'text-gray-700' : 'text-brand-100'}`}>
                              {msg.subject}
                            </p>
                          )}
                          <p className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${inbound ? 'text-gray-800' : 'text-white'}`}>
                            {msg.bodyText || msg.bodyHtml?.replace(/<[^>]+>/g, '') || '(No content)'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Reply composer */}
              <div className="border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
                <div
                  className="flex items-center justify-between px-5 py-2 cursor-pointer"
                  onClick={() => setComposerOpen(o => !o)}
                >
                  <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <Reply className="w-3.5 h-3.5" /> Reply
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${composerOpen ? 'rotate-180' : ''}`} />
                </div>

                {composerOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    {sendError && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-700 bg-red-50 border border-red-200">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="flex-1">{sendError}</span>
                        <button onClick={() => setSendError(null)}>×</button>
                      </div>
                    )}

                    {/* Templates picker */}
                    {templates.length > 0 && (
                      <div className="relative" ref={templateRef}>
                        <button
                          onClick={() => setShowTemplates(s => !s)}
                          className="text-xs text-gray-500 hover:text-brand-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
                        >
                          <BookOpen className="w-3 h-3" /> Templates
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showTemplates && (
                          <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-20 max-h-52 overflow-y-auto">
                            {templates.map(t => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  setReplyBody(t.bodyText || t.body_text || t.subject || '');
                                  setShowTemplates(false);
                                  setTimeout(() => composeRef.current?.focus(), 50);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-brand-50 border-b border-gray-50 last:border-0"
                              >
                                <p className="text-xs font-medium text-gray-800 truncate">{t.name || t.subject}</p>
                                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                  {(t.bodyText || t.body_text || '').substring(0, 60)}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <textarea
                      ref={composeRef}
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      rows={3}
                      placeholder="Type your reply… (Ctrl+Enter to send)"
                      className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl resize-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-colors"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                    />

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Ctrl+Enter to send · <kbd className="font-mono bg-gray-100 border border-gray-200 rounded px-1">r</kbd> to focus</span>
                      <button
                        onClick={handleSendReply}
                        disabled={sending || !replyBody.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 rounded-lg transition-colors inline-flex items-center gap-2"
                      >
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Label dropdown
// ─────────────────────────────────────────────────────────────────────────────
function LabelDropdown({ group, onLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = [
    { key: 'interested',          label: 'Interested',     bg: 'text-green-700 hover:bg-green-50' },
    { key: 'meeting_booked',      label: 'Meeting Booked', bg: 'text-blue-700 hover:bg-blue-50' },
    { key: 'not_interested',      label: 'Not Interested', bg: 'text-red-600 hover:bg-red-50' },
    { key: 'out_of_office',       label: 'Out of Office',  bg: 'text-amber-700 hover:bg-amber-50' },
    { key: 'unsubscribe_request', label: 'Unsubscribe',    bg: 'text-rose-600 hover:bg-rose-50' },
    { key: 'wrong_person',        label: 'Wrong Person',   bg: 'text-gray-600 hover:bg-gray-50' },
    { key: 'auto_reply',          label: 'Auto Reply',     bg: 'text-gray-500 hover:bg-gray-50' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(s => !s)}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        title="Label (1-5)"
      >
        <Tag className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-30 py-1">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Set label</p>
          {options.map(o => (
            <button
              key={o.key}
              onClick={() => { onLabel(group, o.key); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm ${o.bg} transition-colors`}
            >
              {o.label}
              {group.sentiment === o.key && <span className="ml-1 text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
