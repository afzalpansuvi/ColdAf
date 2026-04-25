import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import {
  Plus,
  Search,
  Filter,
  Loader2,
  AlertTriangle,
  Megaphone,
  X,
  ChevronDown,
  CalendarDays,
  Clock,
  Mail,
  RotateCcw,
  Settings2,
  Shield,
} from 'lucide-react';

const CAMPAIGN_STATUSES = ['all', 'draft', 'active', 'paused', 'completed', 'cancelled'];
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_FORM = {
  name: '',
  description: '',
  brandIds: [],
  multiBrandStrategy: 'simultaneous',
  staggerDays: 2,
  industries: '',
  leadTypes: '',
  leadDateFrom: '',
  leadDateTo: '',
  startDate: '',
  endDate: '',
  dailyLimit: 50,
  minDelay: 30,
  maxDelay: 120,
  sendWindowStart: '09:00',
  sendWindowEnd: '17:00',
  sendDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  followUpCount: 2,
  followUpDelays: [3, 5],
  autoPauseEnabled: true,
  bounceRateThreshold: 5,
  spamRateThreshold: 1,
};

export default function Campaigns() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);

  // Data state
  const [campaigns, setCampaigns] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Fetch brands for filter + form
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

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (brandFilter) params.append('brand_id', brandFilter);
      if (search.trim()) params.append('search', search.trim());
      params.append('page', page);
      params.append('limit', limit);

      const res = await api.get(`/campaigns?${params.toString()}`);
      const d = res.data || {};
      setCampaigns(d.campaigns || []);
      setTotal(d.total || 0);
      setTotalPages(d.totalPages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, brandFilter, search, page, limit]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, brandFilter, search]);

  // Form helpers
  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleBrandId = (id) => {
    setForm((prev) => ({
      ...prev,
      brandIds: prev.brandIds.includes(id)
        ? prev.brandIds.filter((b) => b !== id)
        : [...prev.brandIds, id],
    }));
  };

  const toggleSendDay = (day) => {
    setForm((prev) => ({
      ...prev,
      sendDays: prev.sendDays.includes(day)
        ? prev.sendDays.filter((d) => d !== day)
        : [...prev.sendDays, day],
    }));
  };

  const updateFollowUpDelay = (index, value) => {
    setForm((prev) => {
      const delays = [...prev.followUpDelays];
      delays[index] = parseInt(value, 10) || 1;
      return { ...prev, followUpDelays: delays };
    });
  };

  const handleFollowUpCountChange = (count) => {
    const c = Math.max(0, Math.min(5, parseInt(count, 10) || 0));
    setForm((prev) => {
      const delays = [...prev.followUpDelays];
      while (delays.length < c) delays.push(3);
      return { ...prev, followUpCount: c, followUpDelays: delays.slice(0, c) };
    });
  };

  // Submit create campaign
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const body = {
        name: form.name,
        description: form.description,
        brandIds: form.brandIds,
        multiBrandStrategy: form.brandIds.length > 1 ? form.multiBrandStrategy : undefined,
        staggerDays: form.multiBrandStrategy === 'staggered' && form.brandIds.length > 1 ? form.staggerDays : undefined,
        leadFilters: {
          industries: form.industries ? form.industries.split(',').map((s) => s.trim()).filter(Boolean) : [],
          leadTypes: form.leadTypes ? form.leadTypes.split(',').map((s) => s.trim()).filter(Boolean) : [],
          dateFrom: form.leadDateFrom || undefined,
          dateTo: form.leadDateTo || undefined,
        },
        schedule: {
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
        },
        sendingConfig: {
          dailyLimit: form.dailyLimit,
          minDelay: form.minDelay,
          maxDelay: form.maxDelay,
          sendWindowStart: form.sendWindowStart,
          sendWindowEnd: form.sendWindowEnd,
          sendDays: form.sendDays,
        },
        followUpConfig: {
          count: form.followUpCount,
          delays: form.followUpDelays.slice(0, form.followUpCount),
        },
        autoPause: {
          enabled: form.autoPauseEnabled,
          bounceRateThreshold: form.bounceRateThreshold,
          spamRateThreshold: form.spamRateThreshold,
        },
      };

      await api.post('/campaigns', body);
      setShowCreate(false);
      setForm({ ...DEFAULT_FORM });
      fetchCampaigns();
    } catch (err) {
      setCreateError(err.message || 'Failed to create campaign.');
    } finally {
      setCreating(false);
    }
  };

  const openRate = (c) => {
    if (!c.totalSent || c.totalSent === 0) return '--';
    return `${((c.totalOpened / c.totalSent) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} campaign{total !== 1 ? 's' : ''} total
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="card !p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select-field text-sm !pr-8 min-w-[150px]"
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Brand filter */}
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

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns..."
              className="input-field pl-9"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Megaphone className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No campaigns found</p>
            <p className="text-xs mt-1">Try adjusting your filters or create a new campaign.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Name</th>
                    <th className="table-header">Brand(s)</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Sent</th>
                    <th className="table-header text-right">Opened</th>
                    <th className="table-header text-right">Open Rate</th>
                    <th className="table-header text-right">Replies</th>
                    <th className="table-header">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr
                      key={c.id || c._id}
                      onClick={() => navigate(`/campaigns/${c.id || c._id}`)}
                      className="cursor-pointer hover:bg-brand-50/30 transition-colors"
                    >
                      <td className="table-cell font-medium text-gray-800 max-w-[220px] truncate" title={c.name}>
                        {c.name}
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(c.brandNames || []).map((b, i) => (
                            <span key={i} className="badge badge-blue">{b}</span>
                          ))}
                          {(!c.brandNames || c.brandNames.length === 0) && (
                            <span className="text-gray-400 text-xs">--</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {(c.totalSent || 0).toLocaleString()}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {(c.totalOpened || 0).toLocaleString()}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {openRate(c)}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {(c.totalReplied || 0).toLocaleString()}
                      </td>
                      <td className="table-cell text-gray-500 whitespace-nowrap">
                        {c.createdAt ? format(new Date(c.createdAt), 'MMM d, yyyy') : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-brand-100/50">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Create Campaign Modal ─────────────────────────────────── */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setCreateError(null); }}
        title="Create Campaign"
        size="xl"
      >
        <form onSubmit={handleCreate} className="space-y-6">
          {createError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {createError}
            </div>
          )}

          {/* ── Basic Info ────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-brand-600" />
              Basic Information
            </legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                required
                placeholder="e.g. Q1 Outreach - Tech Startups"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                rows={2}
                placeholder="Brief description of this campaign..."
                className="input-field resize-none"
              />
            </div>
          </fieldset>

          {/* ── Brand Selection ───────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Filter className="w-4 h-4 text-brand-600" />
              Brand Selection
            </legend>
            {brands.length === 0 ? (
              <p className="text-sm text-gray-500">No brands available. Create a brand first.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {brands.map((b) => {
                  const bid = b.id || b._id;
                  const checked = form.brandIds.includes(bid);
                  return (
                    <label
                      key={bid}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBrandId(bid)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{b.name}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {form.brandIds.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Multi-Brand Strategy</label>
                  <select
                    value={form.multiBrandStrategy}
                    onChange={(e) => updateForm('multiBrandStrategy', e.target.value)}
                    className="select-field"
                  >
                    <option value="simultaneous">Simultaneous</option>
                    <option value="staggered">Staggered</option>
                  </select>
                </div>
                {form.multiBrandStrategy === 'staggered' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stagger Days</label>
                    <input
                      type="number"
                      value={form.staggerDays}
                      onChange={(e) => updateForm('staggerDays', parseInt(e.target.value, 10) || 1)}
                      min={1}
                      max={30}
                      className="input-field"
                    />
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {/* ── Lead Filters ──────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Filter className="w-4 h-4 text-brand-600" />
              Lead Filters
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industries</label>
                <input
                  type="text"
                  value={form.industries}
                  onChange={(e) => updateForm('industries', e.target.value)}
                  placeholder="Tech, SaaS, Finance (comma separated)"
                  className="input-field"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated list</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead Types</label>
                <input
                  type="text"
                  value={form.leadTypes}
                  onChange={(e) => updateForm('leadTypes', e.target.value)}
                  placeholder="CEO, CTO, VP Sales (comma separated)"
                  className="input-field"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated list</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leads Added From</label>
                <input
                  type="date"
                  value={form.leadDateFrom}
                  onChange={(e) => updateForm('leadDateFrom', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leads Added To</label>
                <input
                  type="date"
                  value={form.leadDateTo}
                  onChange={(e) => updateForm('leadDateTo', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </fieldset>

          {/* ── Schedule ──────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-brand-600" />
              Schedule
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateForm('startDate', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateForm('endDate', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </fieldset>

          {/* ── Sending Config ────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-600" />
              Sending Configuration
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Daily Limit</label>
                <input
                  type="number"
                  value={form.dailyLimit}
                  onChange={(e) => updateForm('dailyLimit', parseInt(e.target.value, 10) || 1)}
                  min={1}
                  max={1000}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Delay (sec)</label>
                <input
                  type="number"
                  value={form.minDelay}
                  onChange={(e) => updateForm('minDelay', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Delay (sec)</label>
                <input
                  type="number"
                  value={form.maxDelay}
                  onChange={(e) => updateForm('maxDelay', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  className="input-field"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send Window Start</label>
                <input
                  type="time"
                  value={form.sendWindowStart}
                  onChange={(e) => updateForm('sendWindowStart', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send Window End</label>
                <input
                  type="time"
                  value={form.sendWindowEnd}
                  onChange={(e) => updateForm('sendWindowEnd', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Send Days</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const active = form.sendDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleSendDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

          {/* ── Follow-Up Config ──────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-brand-600" />
              Follow-Up Configuration
            </legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Follow-Ups</label>
              <input
                type="number"
                value={form.followUpCount}
                onChange={(e) => handleFollowUpCountChange(e.target.value)}
                min={0}
                max={5}
                className="input-field !w-32"
              />
            </div>
            {form.followUpCount > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: form.followUpCount }).map((_, i) => (
                  <div key={i}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Follow-Up #{i + 1} Delay (days)
                    </label>
                    <input
                      type="number"
                      value={form.followUpDelays[i] || 3}
                      onChange={(e) => updateFollowUpDelay(i, e.target.value)}
                      min={1}
                      max={60}
                      className="input-field"
                    />
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          {/* ── Auto-Pause Settings ───────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-600" />
              Auto-Pause Settings
            </legend>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoPauseEnabled}
                  onChange={(e) => updateForm('autoPauseEnabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
              <span className="text-sm text-gray-700">Enable auto-pause on threshold breach</span>
            </div>
            {form.autoPauseEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bounce Rate Threshold (%)</label>
                  <input
                    type="number"
                    value={form.bounceRateThreshold}
                    onChange={(e) => updateForm('bounceRateThreshold', parseFloat(e.target.value) || 0)}
                    min={0}
                    max={100}
                    step={0.5}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Spam Rate Threshold (%)</label>
                  <input
                    type="number"
                    value={form.spamRateThreshold}
                    onChange={(e) => updateForm('spamRateThreshold', parseFloat(e.target.value) || 0)}
                    min={0}
                    max={100}
                    step={0.1}
                    className="input-field"
                  />
                </div>
              </div>
            )}
          </fieldset>

          {/* ── Actions ───────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !form.name.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              {creating ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
