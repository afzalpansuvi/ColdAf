import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import { format, formatDistanceToNow } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import {
  Plus,
  Search,
  Upload,
  Loader2,
  AlertTriangle,
  Users,
  ChevronDown,
  FileUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  FileSpreadsheet,
  Webhook,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';

// ── Constants ───────────────────────────────────────────────────────
const LEAD_STATUSES = ['all', 'new', 'queued', 'sent', 'opened', 'replied', 'bounced', 'unsubscribed'];
const SOURCE_TYPES = ['all', 'google_sheets', 'csv', 'webhook', 'manual'];
const LIMIT = 50;

const STATUS_PILL_COLORS = {
  new: 'bg-gray-100 text-gray-700',
  queued: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  opened: 'bg-purple-100 text-purple-700',
  replied: 'bg-blue-100 text-blue-700',
  bounced: 'bg-red-100 text-red-700',
  unsubscribed: 'bg-red-100 text-red-700',
};

const VERIFICATION_BADGE = {
  unverified: 'bg-gray-100 text-gray-600',
  valid: 'bg-green-100 text-green-700',
  invalid: 'bg-red-100 text-red-700',
  risky: 'bg-yellow-100 text-yellow-700',
  catch_all: 'bg-orange-100 text-orange-700',
};

function scoreColor(score) {
  if (score == null) return 'text-gray-400';
  if (score >= 8) return 'text-green-600 font-semibold';
  if (score >= 4) return 'text-yellow-600 font-semibold';
  return 'text-gray-500';
}

// ── CopyButton (inline) ──────────────────────────────────────────────

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const DEFAULT_ADD_FORM = {
  fullName: '',
  email: '',
  phone: '',
  leadType: '',
  industry: '',
  projectDetails: '',
  brandId: '',
};

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function Leads() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  // Filter state
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Data state
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stats
  const [stats, setStats] = useState(null);

  // Brands for filter/form
  const [brands, setBrands] = useState([]);

  // Add Lead modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...DEFAULT_ADD_FORM });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState(null);

  // Import CSV modal
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importUploading, setImportUploading] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  // Google Sheets dropdown
  const [sheetsDropdownOpen, setSheetsDropdownOpen] = useState(false);
  const [sheets, setSheets] = useState([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [syncingSheetId, setSyncingSheetId] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const sheetsDropdownRef = useRef(null);

  // Webhooks dropdown
  const [webhooksDropdownOpen, setWebhooksDropdownOpen] = useState(false);
  const [webhooks, setWebhooks] = useState([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const webhooksDropdownRef = useRef(null);

  // Assigned filter + users list
  const [assignedFilter, setAssignedFilter] = useState('');
  const [users, setUsers] = useState([]);

  // ── Fetch brands ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/brands');
        if (!cancelled) setBrands(res.data || []);
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch users (for assigned_to filter) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/users');
        if (!cancelled) setUsers(res.data?.users || res.data || []);
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Close dropdowns on outside click ────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (sheetsDropdownRef.current && !sheetsDropdownRef.current.contains(e.target)) {
        setSheetsDropdownOpen(false);
      }
      if (webhooksDropdownRef.current && !webhooksDropdownRef.current.contains(e.target)) {
        setWebhooksDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Fetch Google Sheets when dropdown opens ─────────────────────
  useEffect(() => {
    if (!sheetsDropdownOpen) return;
    let cancelled = false;
    (async () => {
      setSheetsLoading(true);
      try {
        const res = await api.get('/integrations/sheets');
        if (!cancelled) setSheets(res.data || []);
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setSheetsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sheetsDropdownOpen]);

  // ── Fetch webhooks when dropdown opens ──────────────────────────
  useEffect(() => {
    if (!webhooksDropdownOpen) return;
    let cancelled = false;
    (async () => {
      setWebhooksLoading(true);
      try {
        const res = await api.get('/integrations/webhooks');
        if (!cancelled) setWebhooks(res.data || []);
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setWebhooksLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [webhooksDropdownOpen]);

  // ── Sync a Google Sheet ─────────────────────────────────────────
  const handleSyncSheet = async (sheetId) => {
    setSyncingSheetId(sheetId);
    setSyncResult(null);
    try {
      const res = await api.post(`/integrations/sheets/${sheetId}/sync`);
      const count = res.data?.newLeads ?? res.data?.imported ?? 0;
      setSyncResult({ sheetId, message: `${count} new leads imported` });
      fetchLeads();
      fetchStats();
    } catch {
      setSyncResult({ sheetId, message: 'Sync failed', error: true });
    } finally {
      setSyncingSheetId(null);
    }
  };

  // ── Fetch stats ───────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/leads/stats');
      setStats(res.data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Fetch leads ───────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (brandFilter) params.append('brand_id', brandFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (sourceFilter !== 'all') params.append('source_type', sourceFilter);
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (assignedFilter) params.append('assigned_to', assignedFilter);
      params.append('page', page);
      params.append('limit', LIMIT);

      const res = await api.get(`/leads?${params.toString()}`);
      const d = res.data || {};
      setLeads(d.leads || []);
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load leads.');
    } finally {
      setLoading(false);
    }
  }, [brandFilter, statusFilter, sourceFilter, debouncedSearch, dateFrom, dateTo, assignedFilter, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [brandFilter, statusFilter, sourceFilter, debouncedSearch, dateFrom, dateTo, assignedFilter]);

  // ── Add lead ──────────────────────────────────────────────────────
  const handleAddLead = async (e) => {
    e.preventDefault();
    setAddSubmitting(true);
    setAddError(null);
    try {
      await api.post('/leads', {
        fullName: addForm.fullName,
        email: addForm.email,
        phone: addForm.phone || undefined,
        leadType: addForm.leadType || undefined,
        industry: addForm.industry || undefined,
        projectDetails: addForm.projectDetails || undefined,
        brandId: addForm.brandId || undefined,
      });
      setShowAdd(false);
      setAddForm({ ...DEFAULT_ADD_FORM });
      fetchLeads();
      fetchStats();
    } catch (err) {
      setAddError(err.message || 'Failed to add lead.');
    } finally {
      setAddSubmitting(false);
    }
  };

  // ── Import CSV ────────────────────────────────────────────────────
  const handleFileSelect = async (file) => {
    if (!file) return;
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    setImportUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload('/leads/import-csv', fd);
      setImportPreview(res.data);
    } catch (err) {
      setImportError(err.message || 'Failed to process CSV file.');
    } finally {
      setImportUploading(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;
    setImportConfirming(true);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await api.upload('/leads/import-csv?confirm=true', fd);
      setImportResult(res.data);
      setImportPreview(null);
      fetchLeads();
      fetchStats();
    } catch (err) {
      setImportError(err.message || 'Failed to import CSV.');
    } finally {
      setImportConfirming(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeImport = () => {
    setShowImport(false);
    resetImport();
  };

  // ── Drop handler ──────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString()} lead{total !== 1 ? 's' : ''} total
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>

            {/* ── Sync Google Sheets dropdown ────────────────── */}
            <div className="relative" ref={sheetsDropdownRef}>
              <button
                onClick={() => { setSheetsDropdownOpen((v) => !v); setWebhooksDropdownOpen(false); setSyncResult(null); }}
                className="btn-secondary flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Sync Google Sheets
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sheetsDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {sheetsDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                  <div className="p-3 border-b border-gray-100">
                    <h4 className="text-sm font-bold text-gray-800">Connected Google Sheets</h4>
                  </div>
                  {sheetsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                    </div>
                  ) : sheets.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-gray-400">
                      No Google Sheets connected.
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto ">
                      {sheets.map((sheet) => {
                        const sid = sheet.id || sheet._id;
                        return (
                          <div key={sid} className="px-3 py-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-800 truncate max-w-[160px]" title={sheet.name}>
                                {sheet.name}
                              </span>
                              <button
                                onClick={() => handleSyncSheet(sid)}
                                disabled={syncingSheetId === sid}
                                className="btn-secondary btn-sm flex items-center gap-1 text-xs"
                              >
                                {syncingSheetId === sid ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                Sync Now
                              </button>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                              <span>
                                Last sync: {sheet.lastSyncAt
                                  ? formatDistanceToNow(new Date(sheet.lastSyncAt), { addSuffix: true })
                                  : 'Never'}
                              </span>
                              <span>{(sheet.leadsImported || 0).toLocaleString()} leads</span>
                            </div>
                            {syncResult && syncResult.sheetId === sid && (
                              <p className={`text-xs mt-1 ${syncResult.error ? 'text-red-500' : 'text-green-600'}`}>
                                {syncResult.message}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Webhook URLs dropdown ──────────────────────── */}
            <div className="relative" ref={webhooksDropdownRef}>
              <button
                onClick={() => { setWebhooksDropdownOpen((v) => !v); setSheetsDropdownOpen(false); }}
                className="btn-secondary flex items-center gap-2"
              >
                <Webhook className="w-4 h-4" />
                Webhook URLs
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${webhooksDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {webhooksDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-96 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                  <div className="p-3 border-b border-gray-100">
                    <h4 className="text-sm font-bold text-gray-800">Webhook Sources</h4>
                  </div>
                  {webhooksLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                    </div>
                  ) : webhooks.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-gray-400">
                      No webhooks configured.
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto ">
                      {webhooks.map((wh) => {
                        const wid = wh.id || wh._id;
                        return (
                          <div key={wid} className="px-3 py-2.5">
                            <span className="text-sm font-medium text-gray-800">{wh.name}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <code className="text-[11px] bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-600 truncate max-w-[280px]" title={wh.endpointUrl}>
                                {wh.endpointUrl || '--'}
                              </code>
                              {wh.endpointUrl && <CopyBtn text={wh.endpointUrl} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => { setAddError(null); setShowAdd(true); }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </button>
          </div>
        )}
      </div>

      {/* ── Stats Bar ──────────────────────────────────────────────── */}
      {stats && (
        <div className="card !py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-gray-800">
              {(stats.total || 0).toLocaleString()} Total
            </span>
            <span className="w-px h-5 bg-gray-200" />
            {Object.entries(stats.byStatus || {}).map(([s, count]) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  STATUS_PILL_COLORS[s] || 'bg-gray-100 text-gray-700'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="font-bold">{count.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter Bar ─────────────────────────────────────────────── */}
      <div className="card !p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Brand */}
          {brands.length > 0 && (
            <div className="relative">
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="select-field text-sm !pr-8 min-w-[150px]"
              >
                <option value="">All Brands</option>
                {brands.map((b) => (
                  <option key={b.id || b._id} value={b.id || b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Status */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select-field text-sm !pr-8 min-w-[140px]"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Source Type */}
          <div className="relative">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="select-field text-sm !pr-8 min-w-[150px]"
            >
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Sources' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Assigned To */}
          {users.length > 0 && (
            <div className="relative">
              <select
                value={assignedFilter}
                onChange={(e) => setAssignedFilter(e.target.value)}
                className="select-field text-sm !pr-8 min-w-[150px]"
              >
                <option value="">All Assignees</option>
                <option value="unassigned">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id || u._id} value={u.id || u._id}>
                    {u.fullName || u.name || u.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              className="input-field pl-9"
            />
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field !w-auto text-xs"
              placeholder="From"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field !w-auto text-xs"
              placeholder="To"
            />
          </div>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No leads found</p>
            <p className="text-xs mt-1">Try adjusting your filters or add a new lead.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="">
                    <th className="table-header">Full Name</th>
                    <th className="table-header">Email</th>
                    <th className="table-header">Company</th>
                    <th className="table-header">Job Title</th>
                    <th className="table-header">Industry</th>
                    <th className="table-header">Lead Type</th>
                    <th className="table-header">Score</th>
                    <th className="table-header">Verified</th>
                    <th className="table-header">Assigned</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Source</th>
                    <th className="table-header">Added</th>
                  </tr>
                </thead>
                <tbody className="">
                  {leads.map((lead) => (
                    <tr
                      key={lead.id || lead._id}
                      onClick={() => navigate(`/leads/${lead.id || lead._id}`)}
                      className="cursor-pointer hover:bg-brand-50/30 transition-colors"
                    >
                      <td className="table-cell font-medium text-gray-800 max-w-[180px] truncate" title={lead.fullName}>
                        {lead.fullName || '--'}
                      </td>
                      <td className="table-cell text-gray-500 max-w-[200px] truncate" title={lead.email}>
                        {lead.email || '--'}
                      </td>
                      <td className="table-cell text-gray-500 max-w-[150px] truncate" title={lead.company_name}>
                        {lead.company_name || '--'}
                      </td>
                      <td className="table-cell text-gray-500 max-w-[150px] truncate" title={lead.job_title}>
                        {lead.job_title || '--'}
                      </td>
                      <td className="table-cell text-gray-500">{lead.industry || '--'}</td>
                      <td className="table-cell text-gray-500">{lead.leadType || '--'}</td>
                      <td className={`table-cell tabular-nums ${scoreColor(lead.score)}`}>
                        {lead.score != null ? lead.score : '--'}
                      </td>
                      <td className="table-cell">
                        {lead.email_verification_status ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            VERIFICATION_BADGE[lead.email_verification_status] || VERIFICATION_BADGE.unverified
                          }`}>
                            {lead.email_verification_status.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                            unverified
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 text-xs whitespace-nowrap">
                        {lead.assignedUserName || lead.assigned_to_name || (lead.assigned_to ? 'Assigned' : 'Unassigned')}
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="table-cell text-gray-500 capitalize whitespace-nowrap">
                        {lead.sourceType?.replace(/_/g, ' ') || '--'}
                      </td>
                      <td className="table-cell text-gray-500 whitespace-nowrap">
                        {lead.createdAt ? format(new Date(lead.createdAt), 'MMM d, yyyy') : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-200">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* ── Add Lead Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setAddError(null); }}
        title="Add Lead"
        size="lg"
      >
        <form onSubmit={handleAddLead} className="space-y-4">
          {addError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {addError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={addForm.fullName}
                onChange={(e) => setAddForm((p) => ({ ...p, fullName: e.target.value }))}
                required
                placeholder="John Doe"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                required
                placeholder="john@company.com"
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={addForm.phone}
                onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead Type</label>
              <input
                type="text"
                value={addForm.leadType}
                onChange={(e) => setAddForm((p) => ({ ...p, leadType: e.target.value }))}
                placeholder="CEO, CTO, VP Sales..."
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <input
                type="text"
                value={addForm.industry}
                onChange={(e) => setAddForm((p) => ({ ...p, industry: e.target.value }))}
                placeholder="Technology, Finance..."
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <div className="relative">
                <select
                  value={addForm.brandId}
                  onChange={(e) => setAddForm((p) => ({ ...p, brandId: e.target.value }))}
                  className="select-field !pr-8"
                >
                  <option value="">Select brand...</option>
                  {brands.map((b) => (
                    <option key={b.id || b._id} value={b.id || b._id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Details</label>
            <textarea
              value={addForm.projectDetails}
              onChange={(e) => setAddForm((p) => ({ ...p, projectDetails: e.target.value }))}
              rows={3}
              placeholder="Any relevant details about this lead's project or needs..."
              className="input-field resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddError(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addSubmitting || !addForm.fullName.trim() || !addForm.email.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {addSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {addSubmitting ? 'Adding...' : 'Add Lead'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Import CSV Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={showImport}
        onClose={closeImport}
        title="Import Leads from CSV"
        size="xl"
      >
        <div className="space-y-5">
          {importError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {importError}
            </div>
          )}

          {/* Upload result message */}
          {importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div>
                  <p className="font-medium">Import Complete</p>
                  <p className="text-xs mt-0.5">
                    {importResult.imported != null
                      ? `${importResult.imported} leads imported successfully.`
                      : 'Leads imported successfully.'}
                    {importResult.skipped ? ` ${importResult.skipped} skipped.` : ''}
                    {importResult.failed ? ` ${importResult.failed} failed.` : ''}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={closeImport} className="btn-primary">
                  Done
                </button>
              </div>
            </div>
          )}

          {/* File dropzone (only show if no result) */}
          {!importResult && (
            <>
              {!importPreview && !importUploading && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/30 transition-colors"
                >
                  <FileUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700">
                    Drop your CSV file here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Accepts .csv files</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    className="hidden"
                  />
                </div>
              )}

              {/* Loading state */}
              {importUploading && (
                <div className="flex flex-col items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-3" />
                  <p className="text-sm text-gray-500">Processing CSV file...</p>
                </div>
              )}

              {/* Preview */}
              {importPreview && !importUploading && (
                <div className="space-y-4">
                  {/* File info + reset */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <FileUp className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{importFile?.name}</span>
                    </div>
                    <button
                      onClick={resetImport}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Summary pills */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium text-green-700">
                        {importPreview.validCount ?? importPreview.valid ?? 0} Valid
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium text-red-700">
                        {importPreview.invalidCount ?? importPreview.invalid ?? 0} Invalid
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-medium text-yellow-700">
                        {importPreview.duplicateCount ?? importPreview.duplicates ?? 0} Duplicates
                      </span>
                    </div>
                  </div>

                  {/* Preview table */}
                  {importPreview.preview && importPreview.preview.length > 0 && (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="">
                            <th className="table-header">Name</th>
                            <th className="table-header">Email</th>
                            <th className="table-header">Industry</th>
                            <th className="table-header">Lead Type</th>
                          </tr>
                        </thead>
                        <tbody className="">
                          {importPreview.preview.slice(0, 10).map((row, idx) => (
                            <tr key={idx}>
                              <td className="table-cell text-gray-900">{row.fullName || row.name || '--'}</td>
                              <td className="table-cell text-gray-500">{row.email || '--'}</td>
                              <td className="table-cell text-gray-500">{row.industry || '--'}</td>
                              <td className="table-cell text-gray-500">{row.leadType || '--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importPreview.preview.length > 10 && (
                        <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-200">
                          Showing first 10 of {importPreview.preview.length} valid rows
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button onClick={resetImport} className="btn-secondary">
                      Choose Different File
                    </button>
                    <button
                      onClick={handleImportConfirm}
                      disabled={importConfirming || (importPreview.validCount ?? importPreview.valid ?? 0) === 0}
                      className="btn-primary flex items-center gap-2"
                    >
                      {importConfirming && <Loader2 className="w-4 h-4 animate-spin" />}
                      {importConfirming ? 'Importing...' : 'Confirm Import'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
