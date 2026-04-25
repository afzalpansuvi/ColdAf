import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Inbox, Send, Mail } from 'lucide-react';

const STATUS_COLORS = {
  open: 'badge-yellow',
  pending: 'badge-blue',
  resolved: 'badge-green',
  closed: 'badge-gray',
};

const PRIORITY_COLORS = {
  low: 'text-gray-500',
  normal: 'text-gray-700',
  high: 'text-amber-600',
  urgent: 'text-red-600',
};

const FOLDERS = [
  { id: 'open', label: 'Open', statuses: ['open', 'pending'] },
  { id: 'resolved', label: 'Resolved', statuses: ['resolved'] },
  { id: 'closed', label: 'Closed', statuses: ['closed'] },
  { id: 'all', label: 'All', statuses: null },
];

export default function RequestsIssues() {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState('open');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/requests');
      setTickets(res.data?.requests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadOne = async (id) => {
    try {
      const res = await api.get(`/admin/requests/${id}`);
      setSelected(res.data?.request || null);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (selectedId) loadOne(selectedId);
    else setSelected(null);
  }, [selectedId]);

  const currentFolder = FOLDERS.find((f) => f.id === folder);
  const filtered = tickets.filter((t) =>
    !currentFolder.statuses ? true : currentFolder.statuses.includes(t.status)
  );

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim() || !selectedId) return;
    setSending(true);
    try {
      await api.post(`/admin/requests/${selectedId}/reply`, { body: reply });
      setReply('');
      await loadOne(selectedId);
      await loadList();
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status) => {
    try {
      await api.post(`/admin/requests/${selectedId}/status`, { status });
      await loadOne(selectedId);
      await loadList();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Requests & Issues</h1>
        <p className="text-sm text-gray-500 mt-1">Support ticket inbox</p>
      </div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Folders */}
        <div className="col-span-12 sm:col-span-3 lg:col-span-2 card !p-2">
          {FOLDERS.map((f) => {
            const count = f.statuses
              ? tickets.filter((t) => f.statuses.includes(t.status)).length
              : tickets.length;
            return (
              <button
                key={f.id}
                onClick={() => { setFolder(f.id); setSelectedId(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                  folder === f.id
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Inbox className="w-4 h-4" />
                  {f.label}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{count}</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="col-span-12 sm:col-span-4 lg:col-span-4 card !p-0 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
              <Inbox className="w-10 h-10 mb-3" />
              <p className="text-sm">No tickets in this folder</p>
            </div>
          ) : (
            <div className="overflow-y-auto divide-y divide-gray-100">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-brand-50/30 transition ${
                    selectedId === t.id ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${PRIORITY_COLORS[t.priority] || 'text-gray-700'}`}>
                      {t.user_email}
                    </span>
                    <span className={`badge ${STATUS_COLORS[t.status] || 'badge-gray'} capitalize`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 truncate">{t.subject}</div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{t.body}</div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {t.updated_at ? new Date(t.updated_at).toLocaleString() : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reader */}
        <div className="col-span-12 sm:col-span-5 lg:col-span-6 card !p-0 overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
              <Mail className="w-12 h-12 mb-3" />
              <p className="text-sm">Select a ticket to view</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">{selected.subject}</h3>
                    <div className="text-xs text-gray-500 mt-1">
                      {selected.user_email} · {selected.org_name || '—'}
                    </div>
                  </div>
                  <select
                    value={selected.status}
                    onChange={(e) => changeStatus(e.target.value)}
                    className="select-field w-32 !py-1.5 text-xs"
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50/30">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 mb-1">
                    {selected.user_email} · {selected.created_at ? new Date(selected.created_at).toLocaleString() : ''}
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{selected.body}</div>
                </div>
                {(selected.messages || []).map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl p-4 shadow-sm border ${
                      m.from_admin
                        ? 'bg-brand-50 border-brand-100 ml-8'
                        : 'bg-white border-gray-100 mr-8'
                    }`}
                  >
                    <div className="text-xs font-semibold text-gray-500 mb-1">
                      {m.from_admin ? `👑 ${m.author_email}` : m.author_email} ·{' '}
                      {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                    </div>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{m.body}</div>
                  </div>
                ))}
              </div>

              <form onSubmit={sendReply} className="border-t border-gray-100 p-4 flex gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply…"
                  rows="2"
                  className="input-field flex-1 resize-none"
                />
                <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={sending || !reply.trim()}>
                  <Send className="w-4 h-4" />
                  {sending ? '…' : 'Send'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
