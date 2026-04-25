import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  Plus,
  Loader2,
  AlertTriangle,
  Pencil,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Webhook,
  Send,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  ExternalLink,
  X,
  Clock,
  Database,
  Link2,
  Shield,
  Zap,
  Bell,
  Phone,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────

const TABS = [
  { key: 'sheets', label: 'Google Sheets', icon: FileSpreadsheet },
  { key: 'webhooks', label: 'Inbound Webhooks', icon: Webhook },
  { key: 'outbound', label: 'Outbound Integrations', icon: Send },
  { key: 'api-keys', label: 'API Keys', icon: KeyRound },
];

const LEAD_FIELDS = [
  { value: 'full_name', label: 'Full Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'lead_type', label: 'Lead Type' },
  { value: 'industry', label: 'Industry' },
  { value: 'project_details', label: 'Project Details' },
];

const OUTBOUND_TYPES = [
  { value: 'discord', label: 'Discord' },
  { value: 'custom_webhook', label: 'Custom Webhook' },
  { value: 'google_sheets_export', label: 'Google Sheets Export' },
];

const EVENT_TRIGGERS = [
  { key: 'reply_received', label: 'Reply Received' },
  { key: 'campaign_paused', label: 'Campaign Paused' },
  { key: 'smtp_degraded', label: 'SMTP Degraded' },
  { key: 'smtp_failed', label: 'SMTP Failed' },
  { key: 'bounce_threshold', label: 'Bounce Threshold' },
  { key: 'spam_threshold', label: 'Spam Threshold' },
];

const DEFAULT_SHEET_FORM = {
  name: '',
  sheetUrl: '',
  tabName: '',
  pollingInterval: 300,
  brandId: '',
  columnMapping: [
    { column: 'A', field: 'full_name' },
    { column: 'B', field: 'email' },
    { column: 'C', field: 'phone' },
    { column: 'D', field: 'lead_type' },
    { column: 'E', field: 'industry' },
    { column: 'F', field: 'project_details' },
  ],
  serviceAccountCredentials: '',
};

const DEFAULT_WEBHOOK_FORM = {
  name: '',
  brandId: '',
  fieldMapping: [
    { incomingField: '', leadField: 'full_name' },
    { incomingField: '', leadField: 'email' },
  ],
};

const DEFAULT_OUTBOUND_FORM = {
  name: '',
  type: 'discord',
  webhookUrl: '',
  url: '',
  secret: '',
  sheetUrl: '',
  tabName: '',
  eventTriggers: [],
};

// ── Utility: truncate URL ────────────────────────────────────────────

function truncateUrl(url, maxLen = 45) {
  if (!url) return '--';
  return url.length > maxLen ? url.slice(0, maxLen) + '...' : url;
}

// ── Copy button ──────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
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

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function Integrations() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('sheets');
  const [brands, setBrands] = useState([]);

  // Shared toast
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch brands once
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

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Admin access required to manage integrations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Integrations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect external services, manage webhooks, and configure API keys.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl text-sm border ${
            toast.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.type === 'success' ? (
            <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className={`ml-auto ${toast.type === 'success' ? 'text-green-500 hover:text-green-700' : 'text-red-500 hover:text-red-700'}`}
          >
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'sheets' && <SheetsTab brands={brands} setToast={setToast} />}
      {activeTab === 'webhooks' && <WebhooksTab brands={brands} setToast={setToast} />}
      {activeTab === 'outbound' && <OutboundTab brands={brands} setToast={setToast} />}
      {activeTab === 'api-keys' && <ApiKeysTab setToast={setToast} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 1: GOOGLE SHEETS
// ═════════════════════════════════════════════════════════════════════

function SheetsTab({ brands, setToast }) {
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_SHEET_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Test / delete loading
  const [actionLoading, setActionLoading] = useState({});

  const fetchSheets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/integrations/sheets');
      setSheets(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load sheet connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...DEFAULT_SHEET_FORM });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (sheet) => {
    setEditing(sheet);
    setForm({
      name: sheet.name || '',
      sheetUrl: sheet.sheetUrl || '',
      tabName: sheet.tabName || '',
      pollingInterval: sheet.pollingInterval || 300,
      brandId: sheet.brandId || '',
      columnMapping: sheet.columnMapping?.length
        ? sheet.columnMapping
        : DEFAULT_SHEET_FORM.columnMapping,
      serviceAccountCredentials: '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormError(null);
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateMapping = (index, field, value) => {
    setForm((prev) => {
      const updated = [...prev.columnMapping];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, columnMapping: updated };
    });
  };

  const addMappingRow = () => {
    setForm((prev) => ({
      ...prev,
      columnMapping: [...prev.columnMapping, { column: '', field: '' }],
    }));
  };

  const removeMappingRow = (index) => {
    setForm((prev) => ({
      ...prev,
      columnMapping: prev.columnMapping.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const body = {
        name: form.name,
        sheetUrl: form.sheetUrl,
        tabName: form.tabName,
        pollingInterval: form.pollingInterval,
        brandId: form.brandId,
        columnMapping: form.columnMapping.filter((m) => m.column && m.field),
      };
      if (form.serviceAccountCredentials.trim()) {
        body.serviceAccountCredentials = form.serviceAccountCredentials;
      }
      if (editing) {
        await api.put(`/integrations/sheets/${editing.id || editing._id}`, body);
        setToast({ type: 'success', message: 'Sheet connection updated.' });
      } else {
        await api.post('/integrations/sheets', body);
        setToast({ type: 'success', message: 'Sheet connection created.' });
      }
      closeModal();
      fetchSheets();
    } catch (err) {
      setFormError(err.message || 'Failed to save sheet connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (sheet) => {
    const id = sheet.id || sheet._id;
    setActionLoading((prev) => ({ ...prev, [`test-${id}`]: true }));
    try {
      await api.post(`/integrations/sheets/${id}/test`);
      setToast({ type: 'success', message: `Connection test passed for "${sheet.name}".` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Connection test failed.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`test-${id}`]: false }));
    }
  };

  const handleDelete = async (sheet) => {
    if (!window.confirm(`Delete sheet connection "${sheet.name}"?`)) return;
    const id = sheet.id || sheet._id;
    setActionLoading((prev) => ({ ...prev, [`del-${id}`]: true }));
    try {
      await api.delete(`/integrations/sheets/${id}`);
      setToast({ type: 'success', message: 'Sheet connection deleted.' });
      fetchSheets();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to delete.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`del-${id}`]: false }));
    }
  };

  // Sync state
  const [syncResults, setSyncResults] = useState({});

  const handleSync = async (sheet) => {
    const id = sheet.id || sheet._id;
    setActionLoading((prev) => ({ ...prev, [`sync-${id}`]: true }));
    setSyncResults((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await api.post(`/integrations/sheets/${id}/sync`);
      const count = res.data?.newLeads ?? res.data?.imported ?? 0;
      setSyncResults((prev) => ({ ...prev, [id]: { message: `${count} new leads`, error: false } }));
      setToast({ type: 'success', message: `Synced "${sheet.name}": ${count} new leads imported.` });
      fetchSheets();
    } catch (err) {
      setSyncResults((prev) => ({ ...prev, [id]: { message: 'Sync failed', error: true } }));
      setToast({ type: 'error', message: err.message || 'Sync failed.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`sync-${id}`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {sheets.length} sheet connection{sheets.length !== 1 ? 's' : ''}
        </p>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Sheet
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {sheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileSpreadsheet className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No sheet connections</p>
            <p className="text-xs mt-1">Connect a Google Sheet to start importing leads.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Name</th>
                  <th className="table-header">Sheet URL</th>
                  <th className="table-header">Brand</th>
                  <th className="table-header text-right">Poll Interval</th>
                  <th className="table-header">Last Sync</th>
                  <th className="table-header text-right">Leads Imported</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="">
                {sheets.map((sheet) => {
                  const id = sheet.id || sheet._id;
                  return (
                    <tr key={id} className="hover:bg-brand-50/30 transition-colors">
                      <td className="table-cell font-medium text-gray-800">{sheet.name}</td>
                      <td className="table-cell max-w-[200px]">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-gray-500 text-xs" title={sheet.sheetUrl}>
                            {truncateUrl(sheet.sheetUrl, 35)}
                          </span>
                          {sheet.sheetUrl && (
                            <a href={sheet.sheetUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-brand-600 flex-shrink-0">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        {sheet.brandName ? (
                          <span className="badge badge-blue">{sheet.brandName}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">--</span>
                        )}
                      </td>
                      <td className="table-cell text-right tabular-nums text-xs">
                        {sheet.pollingInterval ? `${sheet.pollingInterval}s` : '--'}
                      </td>
                      <td className="table-cell text-xs text-gray-500">
                        {sheet.lastSyncAt
                          ? format(new Date(sheet.lastSyncAt), 'MMM d, yyyy HH:mm')
                          : 'Never'}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {(sheet.leadsImported || 0).toLocaleString()}
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={sheet.isActive ? 'active' : 'paused'} />
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(sheet)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleTest(sheet)}
                            disabled={actionLoading[`test-${id}`]}
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Test Connection"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading[`test-${id}`] ? 'animate-spin' : ''}`} />
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => handleSync(sheet)}
                              disabled={actionLoading[`sync-${id}`]}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Sync Now"
                            >
                              {actionLoading[`sync-${id}`] ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {syncResults[id] && (
                              <span className={`absolute -bottom-4 right-0 whitespace-nowrap text-[10px] ${
                                syncResults[id].error ? 'text-red-500' : 'text-green-600'
                              }`}>
                                {syncResults[id].message}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDelete(sheet)}
                            disabled={actionLoading[`del-${id}`]}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Sheet Modal ────────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editing ? 'Edit Sheet Connection' : 'Add Sheet Connection'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                required
                placeholder="Lead Import - Acme"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.brandId}
                  onChange={(e) => updateForm('brandId', e.target.value)}
                  required
                  className="select-field !pr-8"
                >
                  <option value="">Select brand...</option>
                  {brands.map((b) => (
                    <option key={b.id || b._id} value={b.id || b._id}>{b.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sheet URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={form.sheetUrl}
              onChange={(e) => updateForm('sheetUrl', e.target.value)}
              required
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tab Name</label>
              <input
                type="text"
                value={form.tabName}
                onChange={(e) => updateForm('tabName', e.target.value)}
                placeholder="Sheet1"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Polling Interval (seconds)</label>
              <input
                type="number"
                value={form.pollingInterval}
                onChange={(e) => updateForm('pollingInterval', parseInt(e.target.value, 10) || 60)}
                min={30}
                max={86400}
                className="input-field"
              />
            </div>
          </div>

          {/* Column Mapping */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-gray-800">Column Mapping</label>
              <button
                type="button"
                onClick={addMappingRow}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Add Row
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Column (Letter/Index)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Lead Field</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="">
                  {form.columnMapping.map((mapping, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={mapping.column}
                          onChange={(e) => updateMapping(idx, 'column', e.target.value)}
                          placeholder="A"
                          className="input-field !py-1.5 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <select
                            value={mapping.field}
                            onChange={(e) => updateMapping(idx, 'field', e.target.value)}
                            className="select-field !py-1.5 text-xs !pr-7"
                          >
                            <option value="">Select field...</option>
                            {LEAD_FIELDS.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeMappingRow(idx)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Service Account Credentials */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Account Credentials (JSON)
              {editing && <span className="text-xs text-gray-400 ml-1">(leave blank to keep current)</span>}
            </label>
            <textarea
              value={form.serviceAccountCredentials}
              onChange={(e) => updateForm('serviceAccountCredentials', e.target.value)}
              rows={4}
              placeholder='Paste your service account JSON key here...'
              className="input-field resize-none font-mono text-xs"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={closeModal} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.name.trim() || !form.sheetUrl.trim() || !form.brandId}
              className="btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Connection'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 2: INBOUND WEBHOOKS
// ═════════════════════════════════════════════════════════════════════

function WebhooksTab({ brands, setToast }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_WEBHOOK_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Creation result
  const [createdWebhook, setCreatedWebhook] = useState(null);

  // Events viewer
  const [eventsModal, setEventsModal] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Delete loading
  const [actionLoading, setActionLoading] = useState({});

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/integrations/webhooks');
      setWebhooks(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load webhooks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const openCreate = () => {
    setEditing(null);
    setCreatedWebhook(null);
    setForm({ ...DEFAULT_WEBHOOK_FORM });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (webhook) => {
    setEditing(webhook);
    setCreatedWebhook(null);
    setForm({
      name: webhook.name || '',
      brandId: webhook.brandId || '',
      fieldMapping: webhook.fieldMapping?.length
        ? webhook.fieldMapping
        : DEFAULT_WEBHOOK_FORM.fieldMapping,
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setCreatedWebhook(null);
    setFormError(null);
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateFieldMapping = (index, field, value) => {
    setForm((prev) => {
      const updated = [...prev.fieldMapping];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, fieldMapping: updated };
    });
  };

  const addFieldMappingRow = () => {
    setForm((prev) => ({
      ...prev,
      fieldMapping: [...prev.fieldMapping, { incomingField: '', leadField: '' }],
    }));
  };

  const removeFieldMappingRow = (index) => {
    setForm((prev) => ({
      ...prev,
      fieldMapping: prev.fieldMapping.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const body = {
        name: form.name,
        brandId: form.brandId,
        fieldMapping: form.fieldMapping.filter((m) => m.incomingField && m.leadField),
      };
      if (editing) {
        await api.put(`/integrations/webhooks/${editing.id || editing._id}`, body);
        setToast({ type: 'success', message: 'Webhook updated.' });
        closeModal();
      } else {
        const res = await api.post('/integrations/webhooks', body);
        setCreatedWebhook(res.data);
        setToast({ type: 'success', message: 'Webhook created.' });
      }
      fetchWebhooks();
    } catch (err) {
      setFormError(err.message || 'Failed to save webhook.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (webhook) => {
    if (!window.confirm(`Delete webhook "${webhook.name}"?`)) return;
    const id = webhook.id || webhook._id;
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await api.delete(`/integrations/webhooks/${id}`);
      setToast({ type: 'success', message: 'Webhook deleted.' });
      fetchWebhooks();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to delete.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const viewEvents = async (webhook) => {
    setEventsModal(webhook);
    setEventsLoading(true);
    try {
      const res = await api.get(`/integrations/webhooks/${webhook.id || webhook._id}/events`);
      setEvents(res.data || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {webhooks.length} webhook{webhooks.length !== 1 ? 's' : ''}
        </p>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Webhook
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Webhook className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No inbound webhooks</p>
            <p className="text-xs mt-1">Create a webhook endpoint to receive leads from external sources.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Name</th>
                  <th className="table-header">Endpoint URL</th>
                  <th className="table-header">Brand</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="">
                {webhooks.map((webhook) => {
                  const id = webhook.id || webhook._id;
                  return (
                    <tr key={id} className="hover:bg-brand-50/30 transition-colors">
                      <td className="table-cell font-medium text-gray-800">{webhook.name}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-600 max-w-[300px] truncate">
                            {webhook.endpointUrl || '--'}
                          </code>
                          {webhook.endpointUrl && <CopyButton text={webhook.endpointUrl} />}
                        </div>
                      </td>
                      <td className="table-cell">
                        {webhook.brandName ? (
                          <span className="badge badge-blue">{webhook.brandName}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">--</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={webhook.isActive ? 'active' : 'paused'} />
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(webhook)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => viewEvents(webhook)}
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            title="View Recent Events"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(webhook)}
                            disabled={actionLoading[id]}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Webhook Modal ──────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={createdWebhook ? 'Webhook Created' : editing ? 'Edit Webhook' : 'Add Webhook'}
        size="lg"
      >
        {createdWebhook ? (
          <div className="space-y-5">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800 mb-3">
                Your webhook has been created. Save these details:
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-green-700 mb-1">Endpoint URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white px-3 py-2 rounded border border-green-300 font-mono text-gray-800 break-all">
                      {createdWebhook.endpointUrl}
                    </code>
                    <CopyButton text={createdWebhook.endpointUrl} />
                  </div>
                </div>
                {createdWebhook.secretToken && (
                  <div>
                    <label className="block text-xs font-medium text-green-700 mb-1">Secret Token</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white px-3 py-2 rounded border border-green-300 font-mono text-gray-800 break-all">
                        {createdWebhook.secretToken}
                      </code>
                      <CopyButton text={createdWebhook.secretToken} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={closeModal} className="btn-primary">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {formError && (
              <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  required
                  placeholder="Typeform Leads"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={form.brandId}
                    onChange={(e) => updateForm('brandId', e.target.value)}
                    required
                    className="select-field !pr-8"
                  >
                    <option value="">Select brand...</option>
                    {brands.map((b) => (
                      <option key={b.id || b._id} value={b.id || b._id}>{b.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Field Mapping */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-gray-800">Field Mapping</label>
                <button
                  type="button"
                  onClick={addFieldMappingRow}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  + Add Row
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Incoming Field</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Lead Field</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="">
                    {form.fieldMapping.map((mapping, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={mapping.incomingField}
                            onChange={(e) => updateFieldMapping(idx, 'incomingField', e.target.value)}
                            placeholder="contact_name"
                            className="input-field !py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <select
                              value={mapping.leadField}
                              onChange={(e) => updateFieldMapping(idx, 'leadField', e.target.value)}
                              className="select-field !py-1.5 text-xs !pr-7"
                            >
                              <option value="">Select field...</option>
                              {LEAD_FIELDS.map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeFieldMappingRow(idx)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button
                type="submit"
                disabled={submitting || !form.name.trim() || !form.brandId}
                className="btn-primary flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Webhook'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Events Viewer Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={!!eventsModal}
        onClose={() => { setEventsModal(null); setEvents([]); }}
        title={eventsModal ? `Recent Events - ${eventsModal.name}` : 'Events'}
        size="xl"
      >
        {eventsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Database className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No recent events.</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {events.map((event, idx) => (
              <div key={event.id || idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-800">
                    {event.sourceIp || 'Unknown source'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {event.createdAt ? format(new Date(event.createdAt), 'MMM d, HH:mm:ss') : '--'}
                  </span>
                </div>
                <StatusBadge status={event.status || 'received'} />
                {event.payload && (
                  <pre className="mt-2 text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto text-gray-600 font-mono max-h-32">
                    {typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 3: OUTBOUND INTEGRATIONS
// ═════════════════════════════════════════════════════════════════════

function OutboundTab({ brands, setToast }) {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_OUTBOUND_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState({});

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/integrations/outbound');
      setIntegrations(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load outbound integrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...DEFAULT_OUTBOUND_FORM });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (integration) => {
    setEditing(integration);
    setForm({
      name: integration.name || '',
      type: integration.type || 'discord',
      webhookUrl: integration.webhookUrl || '',
      url: integration.url || '',
      secret: '',
      sheetUrl: integration.sheetUrl || '',
      tabName: integration.tabName || '',
      eventTriggers: integration.eventTriggers || [],
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormError(null);
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleEventTrigger = (key) => {
    setForm((prev) => ({
      ...prev,
      eventTriggers: prev.eventTriggers.includes(key)
        ? prev.eventTriggers.filter((t) => t !== key)
        : [...prev.eventTriggers, key],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const body = {
        name: form.name,
        type: form.type,
        eventTriggers: form.eventTriggers,
      };
      if (form.type === 'discord') {
        body.webhookUrl = form.webhookUrl;
      } else if (form.type === 'custom_webhook') {
        body.url = form.url;
        if (form.secret) body.secret = form.secret;
      } else if (form.type === 'google_sheets_export') {
        body.sheetUrl = form.sheetUrl;
        body.tabName = form.tabName;
      }
      if (editing) {
        await api.put(`/integrations/outbound/${editing.id || editing._id}`, body);
        setToast({ type: 'success', message: 'Outbound integration updated.' });
      } else {
        await api.post('/integrations/outbound', body);
        setToast({ type: 'success', message: 'Outbound integration created.' });
      }
      closeModal();
      fetchIntegrations();
    } catch (err) {
      setFormError(err.message || 'Failed to save integration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (integration) => {
    const id = integration.id || integration._id;
    setActionLoading((prev) => ({ ...prev, [`test-${id}`]: true }));
    try {
      await api.post(`/integrations/outbound/${id}/test`);
      setToast({ type: 'success', message: `Test sent to "${integration.name}".` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Test failed.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`test-${id}`]: false }));
    }
  };

  const handleDelete = async (integration) => {
    if (!window.confirm(`Delete outbound integration "${integration.name}"?`)) return;
    const id = integration.id || integration._id;
    setActionLoading((prev) => ({ ...prev, [`del-${id}`]: true }));
    try {
      await api.delete(`/integrations/outbound/${id}`);
      setToast({ type: 'success', message: 'Integration deleted.' });
      fetchIntegrations();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to delete.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`del-${id}`]: false }));
    }
  };

  const typeLabel = (type) => {
    const found = OUTBOUND_TYPES.find((t) => t.value === type);
    return found ? found.label : type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {integrations.length} outbound integration{integrations.length !== 1 ? 's' : ''}
        </p>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Integration
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {integrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Send className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No outbound integrations</p>
            <p className="text-xs mt-1">Send events to Discord, webhooks, or Google Sheets.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Name</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Event Triggers</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="">
                {integrations.map((integration) => {
                  const id = integration.id || integration._id;
                  return (
                    <tr key={id} className="hover:bg-brand-50/30 transition-colors">
                      <td className="table-cell font-medium text-gray-800">{integration.name}</td>
                      <td className="table-cell">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                          {typeLabel(integration.type)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(integration.eventTriggers || []).map((trigger) => (
                            <span key={trigger} className="badge badge-purple text-[10px]">
                              {trigger.replace(/_/g, ' ')}
                            </span>
                          ))}
                          {(!integration.eventTriggers || integration.eventTriggers.length === 0) && (
                            <span className="text-gray-400 text-xs">None</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={integration.isActive ? 'active' : 'paused'} />
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(integration)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleTest(integration)}
                            disabled={actionLoading[`test-${id}`]}
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Test"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading[`test-${id}`] ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleDelete(integration)}
                            disabled={actionLoading[`del-${id}`]}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Outbound Modal ─────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editing ? 'Edit Outbound Integration' : 'Add Outbound Integration'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                required
                placeholder="Reply Notifications"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.type}
                  onChange={(e) => updateForm('type', e.target.value)}
                  className="select-field !pr-8"
                >
                  {OUTBOUND_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Type-specific config */}
          {form.type === 'discord' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discord Webhook URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={form.webhookUrl}
                onChange={(e) => updateForm('webhookUrl', e.target.value)}
                required
                placeholder="https://discord.com/api/webhooks/..."
                className="input-field"
              />
            </div>
          )}

          {form.type === 'custom_webhook' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => updateForm('url', e.target.value)}
                  required
                  placeholder="https://your-service.com/webhook"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secret (optional)
                  {editing && <span className="text-xs text-gray-400 ml-1">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={form.secret}
                  onChange={(e) => updateForm('secret', e.target.value)}
                  placeholder={editing ? '********' : 'Optional signing secret'}
                  className="input-field"
                />
              </div>
            </div>
          )}

          {form.type === 'google_sheets_export' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sheet URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={form.sheetUrl}
                  onChange={(e) => updateForm('sheetUrl', e.target.value)}
                  required
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tab Name</label>
                <input
                  type="text"
                  value={form.tabName}
                  onChange={(e) => updateForm('tabName', e.target.value)}
                  placeholder="Sheet1"
                  className="input-field"
                />
              </div>
            </div>
          )}

          {/* Event Triggers */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2">Event Triggers</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EVENT_TRIGGERS.map((trigger) => {
                const isChecked = form.eventTriggers.includes(trigger.key);
                return (
                  <label
                    key={trigger.key}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-brand-200 bg-brand-50/50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleEventTrigger(trigger.key)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700">{trigger.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
            <button
              type="submit"
              disabled={submitting || !form.name.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Integration'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 4: API KEYS
// ═════════════════════════════════════════════════════════════════════

function ApiKeysTab({ setToast }) {
  const [keys, setKeys] = useState({
    anthropic: '',
    sendgrid: '',
    mailgun: '',
    openai_api_key: '',
    google_gemini_api_key: '',
    vapi_api_key: '',
    vapi_phone_number_id: '',
    vapi_assistant_id: '',
    vapi_webhook_secret: '',
  });
  const [maskedKeys, setMaskedKeys] = useState({
    anthropic: '',
    sendgrid: '',
    mailgun: '',
    openai_api_key: '',
    google_gemini_api_key: '',
    vapi_api_key: '',
    vapi_phone_number_id: '',
    vapi_assistant_id: '',
    vapi_webhook_secret: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState({});
  const [showKey, setShowKey] = useState({});

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/integrations/api-keys');
      const data = res.data || {};
      setMaskedKeys({
        anthropic: data.anthropic || '',
        sendgrid: data.sendgrid || '',
        mailgun: data.mailgun || '',
        openai_api_key: data.openai_api_key || '',
        google_gemini_api_key: data.google_gemini_api_key || '',
        vapi_api_key: data.vapi_api_key || '',
        vapi_phone_number_id: data.vapi_phone_number_id || '',
        vapi_assistant_id: data.vapi_assistant_id || '',
        vapi_webhook_secret: data.vapi_webhook_secret || '',
      });
      setKeys({
        anthropic: '',
        sendgrid: '',
        mailgun: '',
        openai_api_key: '',
        google_gemini_api_key: '',
        vapi_api_key: '',
        vapi_phone_number_id: '',
        vapi_assistant_id: '',
        vapi_webhook_secret: '',
      });
      setEditingKey({});
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleSave = async (keyName) => {
    if (!keys[keyName]) return;
    setSaving(true);
    try {
      await api.put('/integrations/api-keys', { [keyName]: keys[keyName] });
      setToast({ type: 'success', message: `${keyName.charAt(0).toUpperCase() + keyName.slice(1)} API key updated.` });
      fetchKeys();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save API key.' });
    } finally {
      setSaving(false);
    }
  };

  const API_KEY_ITEMS = [
    { key: 'anthropic', label: 'Anthropic', description: 'Used for AI email generation and the AI agent.', placeholder: 'sk-ant-...' },
    { key: 'openai_api_key', label: 'OpenAI', description: 'Used for OpenAI GPT models and AI features.', placeholder: 'sk-...' },
    { key: 'google_gemini_api_key', label: 'Google Gemini', description: 'Used for Google Gemini AI models.', placeholder: 'AI...' },
    { key: 'sendgrid', label: 'SendGrid', description: 'Used for SendGrid email provider accounts.', placeholder: 'SG....' },
    { key: 'mailgun', label: 'Mailgun', description: 'Used for Mailgun email provider accounts.', placeholder: 'key-...' },
    // VAPI Phone Call Integration
    { key: 'vapi_api_key', label: 'VAPI API Key', description: 'Private API key from dashboard.vapi.ai for phone call integration.', placeholder: 'vapi-...', section: 'Phone Call Integration (VAPI)' },
    { key: 'vapi_phone_number_id', label: 'VAPI Phone Number ID', description: 'ID of the Vapi phone number to make outbound calls from.', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'vapi_assistant_id', label: 'VAPI Assistant ID', description: 'ID of the Vapi AI assistant that handles calls.', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { key: 'vapi_webhook_secret', label: 'VAPI Webhook Secret', description: 'Secret for verifying incoming Vapi webhook payloads.', placeholder: 'whsec_...' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-500">
        Manage API keys for external service integrations. Keys are encrypted at rest.
      </p>

      <div className="space-y-4">
        {API_KEY_ITEMS.map((item) => {
          const isEditing = editingKey[item.key];
          const isVisible = showKey[item.key];

          return (
            <div key={item.key}>
            {item.section && (
              <div className="flex items-center gap-2 mb-3 mt-6 pt-4 border-t border-gray-200">
                <Phone className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-gray-700">{item.section}</h3>
              </div>
            )}
            <div className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-brand-600" />
                    {item.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                </div>
                {!isEditing && (
                  <button
                    onClick={() => setEditingKey((prev) => ({ ...prev, [item.key]: true }))}
                    className="btn-secondary btn-sm flex items-center gap-1.5"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={keys[item.key]}
                      onChange={(e) => setKeys((prev) => ({ ...prev, [item.key]: e.target.value }))}
                      placeholder={item.placeholder}
                      className="input-field !pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSave(item.key)}
                      disabled={saving || !keys[item.key]}
                      className="btn-primary btn-sm flex items-center gap-1.5"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingKey((prev) => ({ ...prev, [item.key]: false }));
                        setKeys((prev) => ({ ...prev, [item.key]: '' }));
                        setShowKey((prev) => ({ ...prev, [item.key]: false }));
                      }}
                      className="btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-gray-100 px-3 py-1.5 rounded font-mono text-gray-500">
                    {maskedKeys[item.key] || 'Not configured'}
                  </code>
                  {maskedKeys[item.key] && (
                    <Check className="w-4 h-4 text-green-500" />
                  )}
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
