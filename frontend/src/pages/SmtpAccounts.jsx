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
  Server,
  Pencil,
  Power,
  RefreshCw,
  ChevronDown,
  Mail,
  Shield,
  KeyRound,
  Activity,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────
const PROVIDERS = [
  { value: 'smtp', label: 'SMTP' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'mailgun', label: 'Mailgun' },
];

const DEFAULT_FORM = {
  brandId: '',
  emailAddress: '',
  displayName: '',
  provider: 'smtp',
  // SMTP fields
  smtpHost: '',
  smtpPort: 587,
  smtpUsername: '',
  smtpPassword: '',
  smtpTls: true,
  imapHost: '',
  imapPort: 993,
  imapUsername: '',
  imapPassword: '',
  // SendGrid / Mailgun
  apiKey: '',
  // Common
  dailySendLimit: 200,
  isActive: true,
};

// ── Health summary pill ──────────────────────────────────────────────
function HealthPill({ label, count, colorClasses }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${colorClasses}`}>
      {label}
      <span className="font-bold">{count}</span>
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function SmtpAccounts() {
  const { isAdmin } = useAuth();

  // Data state
  const [accounts, setAccounts] = useState([]);
  const [healthSummary, setHealthSummary] = useState(null);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Health check loading per-account
  const [healthCheckLoading, setHealthCheckLoading] = useState({});

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // ── Fetch data ──────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, healthRes] = await Promise.all([
        api.get('/smtp'),
        api.get('/smtp/health-summary'),
      ]);
      setAccounts(accountsRes.data || []);
      setHealthSummary(healthRes.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load SMTP accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // ── Form helpers ────────────────────────────────────────────────────
  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openCreate = () => {
    setEditingAccount(null);
    setForm({ ...DEFAULT_FORM });
    setFormError(null);
    setShowModal(true);
  };

  // ── Connect Gmail (OAuth popup flow) ──────────────────────────────
  const handleConnectGmail = async () => {
    try {
      if (brands.length === 0) {
        setError('Please create a Brand first — Gmail accounts are tied to a brand.');
        return;
      }

      // Default to first brand; user can switch in account list or a future picker
      const brandId = brands[0].id || brands[0]._id;

      const res = await api.get(`/gmail/oauth/start?brand_id=${brandId}`);
      const authUrl = res.data?.url;
      if (!authUrl) {
        setError('Failed to initiate Gmail OAuth.');
        return;
      }

      const popup = window.open(
        authUrl,
        'gmail_oauth',
        'width=520,height=640,menubar=no,toolbar=no'
      );

      const listener = (event) => {
        if (!event.data || event.data.type !== 'gmail_oauth') return;
        window.removeEventListener('message', listener);
        if (popup && !popup.closed) popup.close();

        if (event.data.success) {
          fetchAccounts();
        } else {
          setError(`Gmail connection failed: ${event.data.error || 'unknown error'}`);
        }
      };
      window.addEventListener('message', listener);
    } catch (err) {
      setError(err.message || 'Failed to start Gmail OAuth.');
    }
  };

  const handleDisconnectGmail = async (account) => {
    const accountId = account.id || account._id;
    if (!window.confirm(`Disconnect Gmail account ${account.oauthEmail || account.emailAddress}?`)) {
      return;
    }
    try {
      await api.post(`/gmail/oauth/disconnect/${accountId}`);
      fetchAccounts();
    } catch (err) {
      setError(err.message || 'Failed to disconnect Gmail.');
    }
  };

  const openEdit = (account) => {
    setEditingAccount(account);
    setForm({
      brandId: account.brandId || '',
      emailAddress: account.emailAddress || '',
      displayName: account.displayName || '',
      provider: account.provider || 'smtp',
      smtpHost: account.smtpHost || '',
      smtpPort: account.smtpPort || 587,
      smtpUsername: account.smtpUsername || '',
      smtpPassword: '',
      smtpTls: account.smtpTls !== false,
      imapHost: account.imapHost || '',
      imapPort: account.imapPort || 993,
      imapUsername: account.imapUsername || '',
      imapPassword: '',
      apiKey: '',
      dailySendLimit: account.dailySendLimit || 200,
      isActive: account.isActive !== false,
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAccount(null);
    setFormError(null);
  };

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const body = {
        brandId: form.brandId,
        emailAddress: form.emailAddress,
        displayName: form.displayName,
        provider: form.provider,
        dailySendLimit: form.dailySendLimit,
        isActive: form.isActive,
      };

      if (form.provider === 'smtp') {
        body.smtpHost = form.smtpHost;
        body.smtpPort = form.smtpPort;
        body.smtpUsername = form.smtpUsername;
        if (form.smtpPassword) body.smtpPassword = form.smtpPassword;
        body.smtpTls = form.smtpTls;
        body.imapHost = form.imapHost;
        body.imapPort = form.imapPort;
        body.imapUsername = form.imapUsername;
        if (form.imapPassword) body.imapPassword = form.imapPassword;
      } else {
        if (form.apiKey) body.apiKey = form.apiKey;
      }

      if (editingAccount) {
        await api.put(`/smtp/${editingAccount.id || editingAccount._id}`, body);
      } else {
        await api.post('/smtp', body);
      }

      closeModal();
      fetchAccounts();
    } catch (err) {
      setFormError(err.message || 'Failed to save account.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Health check ───────────────────────────────────────────────────
  const triggerHealthCheck = async (account) => {
    const accountId = account.id || account._id;
    setHealthCheckLoading((prev) => ({ ...prev, [accountId]: true }));
    try {
      await api.post(`/smtp/${accountId}/health-check`);
      // Refresh the account list after health check
      const [accountsRes, healthRes] = await Promise.all([
        api.get('/smtp'),
        api.get('/smtp/health-summary'),
      ]);
      setAccounts(accountsRes.data || []);
      setHealthSummary(healthRes.data || null);
    } catch (err) {
      setError(err.message || 'Health check failed.');
    } finally {
      setHealthCheckLoading((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  // ── Deactivate / Activate ─────────────────────────────────────────
  const handleToggleActive = async (account) => {
    const accountId = account.id || account._id;
    try {
      await api.put(`/smtp/${accountId}`, { isActive: !account.isActive });
      fetchAccounts();
    } catch (err) {
      setError(err.message || 'Failed to update account status.');
    }
  };

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading SMTP accounts...</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">SMTP Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleConnectGmail}
              className="btn-secondary flex items-center gap-2"
              title="Connect a Gmail account via OAuth (unlimited accounts)"
            >
              <Mail className="w-4 h-4 text-red-500" />
              Connect Gmail
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Account
            </button>
          </div>
        )}
      </div>

      {/* Health summary bar */}
      {healthSummary && (
        <div className="card !py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Activity className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-sm font-bold text-gray-800">Health Overview</span>
            <span className="w-px h-5 bg-gray-200" />
            <HealthPill label="Healthy" count={healthSummary.healthy || 0} colorClasses="bg-green-100 text-green-700" />
            <HealthPill label="Degraded" count={healthSummary.degraded || 0} colorClasses="bg-yellow-100 text-yellow-700" />
            <HealthPill label="Failed" count={healthSummary.failed || 0} colorClasses="bg-red-100 text-red-700" />
            <HealthPill label="Unknown" count={healthSummary.unknown || 0} colorClasses="bg-gray-100 text-gray-700" />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Server className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No SMTP accounts yet</p>
            <p className="text-xs mt-1">Add your first SMTP account to start sending emails.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Email Address</th>
                  <th className="table-header">Display Name</th>
                  <th className="table-header">Brand</th>
                  <th className="table-header">Provider</th>
                  <th className="table-header">Health</th>
                  <th className="table-header text-right">Daily Limit</th>
                  <th className="table-header text-right">Sends Today</th>
                  <th className="table-header">Active</th>
                  {isAdmin && <th className="table-header text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="">
                {accounts.map((account) => {
                  const accountId = account.id || account._id;
                  const isChecking = healthCheckLoading[accountId];
                  return (
                    <tr key={accountId} className="hover:bg-brand-50/30 transition-colors">
                      <td className="table-cell font-medium text-gray-800 max-w-[220px] truncate" title={account.emailAddress}>
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          {account.emailAddress}
                        </div>
                      </td>
                      <td className="table-cell text-gray-600 max-w-[160px] truncate" title={account.displayName}>
                        {account.displayName || '--'}
                      </td>
                      <td className="table-cell">
                        {account.brandName ? (
                          <span className="badge badge-blue">{account.brandName}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">--</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md uppercase">
                          {account.provider || 'smtp'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge status={account.healthStatus || 'unknown'} />
                          {account.lastHealthCheckAt && (
                            <span className="text-[10px] text-gray-400">
                              {format(new Date(account.lastHealthCheckAt), 'MMM d, HH:mm')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {(account.dailySendLimit || 0).toLocaleString()}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        <span className={
                          account.sendsToday >= (account.dailySendLimit || Infinity) * 0.9
                            ? 'text-red-600 font-semibold'
                            : account.sendsToday >= (account.dailySendLimit || Infinity) * 0.7
                            ? 'text-amber-600 font-medium'
                            : ''
                        }>
                          {(account.sendsToday || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={account.isActive ? 'active' : 'inactive'} />
                      </td>
                      {isAdmin && (
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEdit(account)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => triggerHealthCheck(account)}
                              disabled={isChecking}
                              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Run Health Check"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              onClick={() => handleToggleActive(account)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                account.isActive
                                  ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                                  : 'text-green-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={account.isActive ? 'Deactivate' : 'Activate'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit SMTP Account Modal ───────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingAccount ? 'Edit SMTP Account' : 'Add SMTP Account'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {formError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* ── Basic Info ─────────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-600" />
              Account Details
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <option key={b.id || b._id} value={b.id || b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.emailAddress}
                  onChange={(e) => updateForm('emailAddress', e.target.value)}
                  required
                  placeholder="outreach@acme.com"
                  className="input-field"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => updateForm('displayName', e.target.value)}
                  required
                  placeholder="Jane Doe"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Daily Send Limit</label>
                <input
                  type="number"
                  value={form.dailySendLimit}
                  onChange={(e) => updateForm('dailySendLimit', parseInt(e.target.value, 10) || 1)}
                  min={1}
                  max={10000}
                  className="input-field"
                />
              </div>
            </div>
          </fieldset>

          {/* ── Provider Selection ─────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Server className="w-4 h-4 text-brand-600" />
              Provider
            </legend>
            <div className="flex flex-wrap gap-3">
              {PROVIDERS.map((p) => (
                <label
                  key={p.value}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                    form.provider === p.value
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={p.value}
                    checked={form.provider === p.value}
                    onChange={(e) => updateForm('provider', e.target.value)}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{p.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* ── Provider-specific fields ───────────────────────────── */}
          {form.provider === 'smtp' && (
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-600" />
                SMTP Settings
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={form.smtpHost}
                    onChange={(e) => updateForm('smtpHost', e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                  <input
                    type="number"
                    value={form.smtpPort}
                    onChange={(e) => updateForm('smtpPort', parseInt(e.target.value, 10) || 587)}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Username</label>
                  <input
                    type="text"
                    value={form.smtpUsername}
                    onChange={(e) => updateForm('smtpUsername', e.target.value)}
                    placeholder="user@acme.com"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SMTP Password
                    {editingAccount && <span className="text-xs text-gray-400 ml-1">(leave blank to keep current)</span>}
                  </label>
                  <input
                    type="password"
                    value={form.smtpPassword}
                    onChange={(e) => updateForm('smtpPassword', e.target.value)}
                    placeholder={editingAccount ? '********' : 'Password or app password'}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.smtpTls}
                    onChange={(e) => updateForm('smtpTls', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
                <span className="text-sm text-gray-700">Use TLS/STARTTLS</span>
              </div>

              {/* IMAP Settings */}
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">IMAP Settings (for reply detection)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Host</label>
                    <input
                      type="text"
                      value={form.imapHost}
                      onChange={(e) => updateForm('imapHost', e.target.value)}
                      placeholder="imap.gmail.com"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Port</label>
                    <input
                      type="number"
                      value={form.imapPort}
                      onChange={(e) => updateForm('imapPort', parseInt(e.target.value, 10) || 993)}
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Username</label>
                    <input
                      type="text"
                      value={form.imapUsername}
                      onChange={(e) => updateForm('imapUsername', e.target.value)}
                      placeholder="user@acme.com"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IMAP Password
                      {editingAccount && <span className="text-xs text-gray-400 ml-1">(leave blank to keep current)</span>}
                    </label>
                    <input
                      type="password"
                      value={form.imapPassword}
                      onChange={(e) => updateForm('imapPassword', e.target.value)}
                      placeholder={editingAccount ? '********' : 'Password or app password'}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>
            </fieldset>
          )}

          {form.provider === 'sendgrid' && (
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-brand-600" />
                SendGrid Settings
              </legend>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                  {editingAccount && <span className="text-xs text-gray-400 ml-1">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => updateForm('apiKey', e.target.value)}
                  placeholder={editingAccount ? '********' : 'SG.xxxxxxx'}
                  className="input-field"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your SendGrid API key with Mail Send permissions.
                </p>
              </div>
            </fieldset>
          )}

          {form.provider === 'mailgun' && (
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-brand-600" />
                Mailgun Settings
              </legend>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                  {editingAccount && <span className="text-xs text-gray-400 ml-1">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => updateForm('apiKey', e.target.value)}
                  placeholder={editingAccount ? '********' : 'key-xxxxxxx'}
                  className="input-field"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your Mailgun private API key.
                </p>
              </div>
            </fieldset>
          )}

          {/* ── Active Toggle ──────────────────────────────────────── */}
          <div className="flex items-center gap-3 py-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateForm('isActive', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
            <span className="text-sm text-gray-700">Account Active</span>
          </div>

          {/* ── Actions ────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={closeModal}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.brandId || !form.emailAddress.trim() || !form.displayName.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting
                ? (editingAccount ? 'Saving...' : 'Creating...')
                : (editingAccount ? 'Save Changes' : 'Create Account')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
