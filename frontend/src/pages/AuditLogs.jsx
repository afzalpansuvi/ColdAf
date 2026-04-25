import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import {
  Loader2,
  AlertTriangle,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Shield,
  FileText,
  Filter,
  Calendar,
  X,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────

const ACTION_TYPE_COLORS = {
  create: 'badge-green',
  update: 'badge-blue',
  delete: 'badge-red',
  login: 'badge-purple',
  logout: 'badge-gray',
  send: 'badge-blue',
  pause: 'badge-yellow',
  resume: 'badge-green',
  import: 'badge-purple',
  export: 'badge-blue',
  test: 'badge-gray',
  trigger: 'badge-yellow',
  confirm: 'badge-green',
};

function ActionTypeBadge({ actionType }) {
  if (!actionType) return null;
  const normalized = actionType.toLowerCase().split('.')[0];
  const colorClass = ACTION_TYPE_COLORS[normalized] || 'badge-gray';
  return (
    <span className={`badge ${colorClass}`}>
      {actionType}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function AuditLogs() {
  const { isAdmin } = useAuth();

  // Data
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [page, setPage] = useState(1);
  const [actorId, setActorId] = useState('');
  const [actionType, setActionType] = useState('');
  const [targetType, setTargetType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Filter options
  const [actors, setActors] = useState([]);
  const [actionTypes, setActionTypes] = useState([]);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState({});

  // Export
  const [exporting, setExporting] = useState(false);

  // ── Fetch filter options ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [actorsRes, typesRes] = await Promise.all([
          api.get('/users').catch(() => ({ data: [] })),
          api.get('/audit-logs/action-types').catch(() => ({ data: [] })),
        ]);
        if (!cancelled) {
          setActors(actorsRes.data || []);
          setActionTypes(typesRes.data || []);
        }
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch logs ────────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', 50);
      if (actorId) params.set('actor_id', actorId);
      if (actionType) params.set('action_type', actionType);
      if (targetType) params.set('target_type', targetType);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (search) params.set('search', search);

      const res = await api.get(`/audit-logs?${params.toString()}`);
      const data = res.data || {};
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [page, actorId, actionType, targetType, dateFrom, dateTo, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Search handler ────────────────────────────────────────────────

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  // ── Clear filters ─────────────────────────────────────────────────

  const clearFilters = () => {
    setActorId('');
    setActionType('');
    setTargetType('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setSearchInput('');
    setPage(1);
  };

  const hasActiveFilters = actorId || actionType || targetType || dateFrom || dateTo || search;

  // ── Toggle expanded row ───────────────────────────────────────────

  const toggleRow = (logId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  };

  // ── Export CSV ────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (actorId) params.set('actor_id', actorId);
      if (actionType) params.set('action_type', actionType);
      if (targetType) params.set('target_type', targetType);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (search) params.set('search', search);

      const blob = await api.get(`/audit-logs/export?${params.toString()}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message || 'Failed to export audit logs.');
    } finally {
      setExporting(false);
    }
  };

  // ── Admin guard ──────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Admin access required to view audit logs.</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString()} log entr{total === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary flex items-center gap-2"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Actor filter */}
          <div className="relative">
            <select
              value={actorId}
              onChange={(e) => { setActorId(e.target.value); setPage(1); }}
              className="select-field text-xs !pr-8"
            >
              <option value="">All Users</option>
              {actors.map((actor) => (
                <option key={actor.id || actor._id} value={actor.id || actor._id}>
                  {actor.name || actor.email}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Action type filter */}
          <div className="relative">
            <select
              value={actionType}
              onChange={(e) => { setActionType(e.target.value); setPage(1); }}
              className="select-field text-xs !pr-8"
            >
              <option value="">All Actions</option>
              {actionTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Target type filter */}
          <div>
            <input
              type="text"
              value={targetType}
              onChange={(e) => { setTargetType(e.target.value); setPage(1); }}
              placeholder="Target type..."
              className="input-field text-xs"
            />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="input-field !w-auto text-xs flex-1"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="input-field !w-auto text-xs flex-1"
            />
          </div>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search logs..."
              className="input-field text-xs !pl-8"
            />
          </form>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No audit logs found</p>
            <p className="text-xs mt-1">
              {hasActiveFilters ? 'Try adjusting your filters.' : 'Activity will appear here once actions are taken.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header w-8"></th>
                  <th className="table-header">Timestamp</th>
                  <th className="table-header">Actor</th>
                  <th className="table-header">Action</th>
                  <th className="table-header">Target</th>
                  <th className="table-header">Description</th>
                </tr>
              </thead>
              <tbody className="">
                {logs.map((log) => {
                  const logId = log.id || log._id;
                  const isExpanded = expandedRows[logId];

                  return (
                    <LogRow
                      key={logId}
                      log={log}
                      logId={logId}
                      isExpanded={isExpanded}
                      onToggle={() => toggleRow(logId)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && logs.length > 0 && (
          <div className="border-t border-gray-200">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Log Row Component ────────────────────────────────────────────────

function LogRow({ log, logId, isExpanded, onToggle }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="hover:bg-brand-50/30 transition-colors cursor-pointer group"
      >
        <td className="table-cell w-8">
          <button className="p-0.5 text-gray-400 group-hover:text-gray-600 transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </td>
        <td className="table-cell text-xs tabular-nums whitespace-nowrap text-gray-500">
          {log.createdAt ? format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss') : '--'}
        </td>
        <td className="table-cell">
          <span className="text-sm font-medium text-gray-800">{log.actorName || 'System'}</span>
        </td>
        <td className="table-cell">
          <ActionTypeBadge actionType={log.actionType} />
        </td>
        <td className="table-cell">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-700">{log.targetType || '--'}</span>
            {log.targetId && (
              <span className="text-[10px] text-gray-400 font-mono">{log.targetId}</span>
            )}
          </div>
        </td>
        <td className="table-cell max-w-[280px]">
          <span
            className="text-sm text-gray-600 truncate block"
            title={log.description}
          >
            {log.description || '--'}
          </span>
        </td>
      </tr>

      {/* Expanded details */}
      {isExpanded && (
        <tr>
          <td colSpan={6} className="bg-gray-50/70 px-4 py-4">
            <div className="ml-8 space-y-3">
              {/* Full description */}
              {log.description && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Full Description
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.description}</p>
                </div>
              )}

              {/* IP Address */}
              {log.ipAddress && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    IP Address
                  </p>
                  <code className="text-xs bg-white px-2 py-1 rounded border border-gray-200 font-mono text-gray-600">
                    {log.ipAddress}
                  </code>
                </div>
              )}

              {/* Metadata */}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Metadata
                  </p>
                  <pre className="text-xs bg-white p-3 rounded-lg border border-gray-200 overflow-x-auto font-mono text-gray-600 max-h-48">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
