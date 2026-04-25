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
  Building2,
  Globe,
  Server,
  Pencil,
  Power,
  Upload,
  ChevronDown,
  Link,
  Brain,
  Clock,
  Calendar,
  Mail,
  FileSignature,
  ExternalLink,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AI_MODEL_GROUPS = [
  {
    label: 'Anthropic Claude',
    models: [
      { value: 'claude-haiku-3-5', label: 'Claude 3.5 Haiku' },
      { value: 'claude-sonnet-4-5-20250514', label: 'Claude 4.5 Sonnet' },
    ],
  },
  {
    label: 'OpenAI',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  {
    label: 'Google Gemini',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
];

const DEFAULT_FORM = {
  name: '',
  primaryDomain: '',
  officeAddress: '',
  websiteUrl: '',
  trackingDomain: '',
  aiSystemPrompt: '',
  bookingLink: '',
  aiModel: 'claude-haiku-3-5',
  dailySendLimit: 100,
  sendWindowStart: '09:00',
  sendWindowEnd: '17:00',
  sendDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  minDelayMinutes: 2,
  maxDelayMinutes: 8,
  logo: null,
  signatureId: '',
};

// ── Logo Placeholder ─────────────────────────────────────────────────
function BrandLogo({ brand, size = 'md' }) {
  const dims = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm';

  if (brand.logoUrl) {
    return (
      <img
        src={brand.logoUrl}
        alt={brand.name}
        className={`${dims} rounded-lg object-cover`}
      />
    );
  }

  const initials = brand.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Generate a deterministic color from the name
  const colors = [
    'bg-blue-600', 'bg-indigo-600', 'bg-purple-600', 'bg-pink-600',
    'bg-red-600', 'bg-orange-600', 'bg-amber-600', 'bg-emerald-600',
    'bg-teal-600', 'bg-cyan-600',
  ];
  let hash = 0;
  for (let i = 0; i < brand.name.length; i++) {
    hash = brand.name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorClass = colors[Math.abs(hash) % colors.length];

  return (
    <div className={`${dims} ${colorClass} rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function Brands() {
  const { isAdmin } = useAuth();

  // Data state
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Signatures state
  const [signatures, setSignatures] = useState([]);

  // ── Fetch brands ────────────────────────────────────────────────────
  const fetchBrands = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/brands');
      setBrands(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load brands.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  // ── Fetch signatures for brand ─────────────────────────────────────
  const fetchSignatures = useCallback(async (brandId) => {
    try {
      const res = await api.get(`/signatures?brand_id=${brandId}`);
      setSignatures(res.data || []);
    } catch {
      setSignatures([]);
    }
  }, []);

  useEffect(() => {
    if (showModal && editingBrand) {
      const brandId = editingBrand.id || editingBrand._id;
      fetchSignatures(brandId);
    } else {
      setSignatures([]);
    }
  }, [showModal, editingBrand, fetchSignatures]);

  // ── Form helpers ────────────────────────────────────────────────────
  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleSendDay = (day) => {
    setForm((prev) => ({
      ...prev,
      sendDays: prev.sendDays.includes(day)
        ? prev.sendDays.filter((d) => d !== day)
        : [...prev.sendDays, day],
    }));
  };

  const openCreate = () => {
    setEditingBrand(null);
    setForm({ ...DEFAULT_FORM });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (brand) => {
    setEditingBrand(brand);
    setForm({
      name: brand.name || '',
      primaryDomain: brand.primaryDomain || '',
      officeAddress: brand.officeAddress || '',
      websiteUrl: brand.websiteUrl || '',
      trackingDomain: brand.trackingDomain || '',
      aiSystemPrompt: brand.aiSystemPrompt || '',
      bookingLink: brand.bookingLink || '',
      aiModel: brand.aiModel || 'claude-haiku-3-5',
      dailySendLimit: brand.dailySendLimit || 100,
      sendWindowStart: brand.sendWindowStart || '09:00',
      sendWindowEnd: brand.sendWindowEnd || '17:00',
      sendDays: brand.sendDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      minDelayMinutes: brand.minDelayMinutes ?? 2,
      maxDelayMinutes: brand.maxDelayMinutes ?? 8,
      logo: null,
      signatureId: brand.signatureId || '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBrand(null);
    setFormError(null);
  };

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const payload = new FormData();
      payload.append('name', form.name);
      payload.append('primaryDomain', form.primaryDomain);
      if (form.officeAddress) payload.append('officeAddress', form.officeAddress);
      if (form.websiteUrl) payload.append('websiteUrl', form.websiteUrl);
      if (form.trackingDomain) payload.append('trackingDomain', form.trackingDomain);
      if (form.aiSystemPrompt) payload.append('aiSystemPrompt', form.aiSystemPrompt);
      if (form.bookingLink) payload.append('bookingLink', form.bookingLink);
      if (form.signatureId) payload.append('signatureId', form.signatureId);
      payload.append('aiModel', form.aiModel);
      payload.append('dailySendLimit', form.dailySendLimit);
      payload.append('sendWindowStart', form.sendWindowStart);
      payload.append('sendWindowEnd', form.sendWindowEnd);
      payload.append('sendDays', JSON.stringify(form.sendDays));
      payload.append('minDelayMinutes', form.minDelayMinutes);
      payload.append('maxDelayMinutes', form.maxDelayMinutes);
      if (form.logo) {
        payload.append('logo', form.logo);
      }

      if (editingBrand) {
        await api.upload(`/brands/${editingBrand.id || editingBrand._id}`, payload);
      } else {
        await api.upload('/brands', payload);
      }

      closeModal();
      fetchBrands();
    } catch (err) {
      setFormError(err.message || 'Failed to save brand.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Deactivate brand ───────────────────────────────────────────────
  const handleDeactivate = async (brand) => {
    const brandId = brand.id || brand._id;
    const newStatus = brand.isActive ? false : true;
    try {
      await api.put(`/brands/${brandId}`, { isActive: newStatus });
      fetchBrands();
    } catch (err) {
      setError(err.message || 'Failed to update brand status.');
    }
  };

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading brands...</p>
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
          <h1 className="text-2xl font-bold text-gray-800">Brands</h1>
          <p className="text-sm text-gray-500 mt-1">
            {brands.length} brand{brands.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Brand
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Brand Grid */}
      {brands.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Building2 className="w-10 h-10 mb-3" />
          <p className="text-sm font-medium">No brands yet</p>
          <p className="text-xs mt-1">Create your first brand to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {brands.map((brand) => {
            const brandId = brand.id || brand._id;
            return (
              <div
                key={brandId}
                className="card hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  <BrandLogo brand={brand} size="lg" />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {brand.name}
                        </h3>
                        <p className="text-sm text-gray-500 truncate">
                          {brand.primaryDomain}
                        </p>
                      </div>
                      <StatusBadge status={brand.isActive ? 'active' : 'inactive'} />
                    </div>

                    {/* Meta info */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
                      {brand.websiteUrl && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" />
                          <a
                            href={brand.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand-600 truncate max-w-[180px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {brand.websiteUrl.replace(/^https?:\/\//, '')}
                          </a>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Server className="w-3.5 h-3.5" />
                        {brand.smtpAccountsCount ?? 0} SMTP account{(brand.smtpAccountsCount ?? 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {brand.dailySendLimit || 0}/day limit
                      </span>
                      {brand.createdAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(new Date(brand.createdAt), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    {isAdmin && (
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          onClick={() => openEdit(brand)}
                          className="btn-secondary btn-sm flex items-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeactivate(brand)}
                          className={`btn-sm flex items-center gap-1.5 rounded-lg border font-medium text-xs px-3 py-1.5 transition-colors ${
                            brand.isActive
                              ? 'border-red-300 text-red-700 hover:bg-red-50'
                              : 'border-green-300 text-green-700 hover:bg-green-50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {brand.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Brand Modal ──────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingBrand ? 'Edit Brand' : 'Add Brand'}
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
              <Building2 className="w-4 h-4 text-brand-600" />
              Basic Information
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  required
                  placeholder="Acme Corp"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Domain <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.primaryDomain}
                  onChange={(e) => updateForm('primaryDomain', e.target.value)}
                  required
                  placeholder="acme.com"
                  className="input-field"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Office Address</label>
                <input
                  type="text"
                  value={form.officeAddress}
                  onChange={(e) => updateForm('officeAddress', e.target.value)}
                  placeholder="123 Main St, City, State"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                <input
                  type="url"
                  value={form.websiteUrl}
                  onChange={(e) => updateForm('websiteUrl', e.target.value)}
                  placeholder="https://acme.com"
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Domain</label>
              <input
                type="text"
                value={form.trackingDomain}
                onChange={(e) => updateForm('trackingDomain', e.target.value)}
                placeholder="track.yourdomain.com"
                className="input-field"
              />
              <p className="text-xs text-gray-400 mt-1">
                Set up a CNAME record pointing this subdomain to your server for custom tracking URLs
              </p>
            </div>
          </fieldset>

          {/* ── AI Configuration ───────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Brain className="w-4 h-4 text-brand-600" />
              AI Configuration
            </legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AI System Prompt</label>
              <textarea
                value={form.aiSystemPrompt}
                onChange={(e) => updateForm('aiSystemPrompt', e.target.value)}
                rows={4}
                placeholder="You are a professional outreach assistant for {brand_name}. Write personalized cold emails that are concise, relevant, and focused on the value we can provide. Mention specific details about the prospect's business. Keep emails under 150 words."
                className="input-field resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Instructions for the AI when generating emails for this brand. Use {'{brand_name}'}, {'{lead_name}'}, etc. as placeholders.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Booking Link</label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={form.bookingLink}
                    onChange={(e) => updateForm('bookingLink', e.target.value)}
                    placeholder="https://calendly.com/your-brand"
                    className="input-field pl-9"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">AI Model</label>
                <div className="relative">
                  <select
                    value={form.aiModel}
                    onChange={(e) => updateForm('aiModel', e.target.value)}
                    className="select-field !pr-8"
                  >
                    {AI_MODEL_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.models.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </fieldset>

          {/* ── Sending Configuration ──────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-600" />
              Sending Configuration
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Delay (min)</label>
                <input
                  type="number"
                  value={form.minDelayMinutes}
                  onChange={(e) => updateForm('minDelayMinutes', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={120}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Delay (min)</label>
                <input
                  type="number"
                  value={form.maxDelayMinutes}
                  onChange={(e) => updateForm('maxDelayMinutes', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={120}
                  className="input-field"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Send Window Start
                </label>
                <input
                  type="time"
                  value={form.sendWindowStart}
                  onChange={(e) => updateForm('sendWindowStart', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Send Window End
                </label>
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

          {/* ── Logo Upload ────────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Upload className="w-4 h-4 text-brand-600" />
              Brand Logo
            </legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Upload Logo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => updateForm('logo', e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 file:cursor-pointer"
              />
              <p className="text-xs text-gray-400 mt-1">
                Recommended: square image, at least 200x200px. PNG or JPG.
              </p>
              {editingBrand?.logoUrl && !form.logo && (
                <div className="mt-2 flex items-center gap-2">
                  <img
                    src={editingBrand.logoUrl}
                    alt="Current logo"
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                  <span className="text-xs text-gray-500">Current logo</span>
                </div>
              )}
            </div>
          </fieldset>

          {/* ── Email Signature ─────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-brand-600" />
              Email Signature
            </legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Signature</label>
              <div className="relative">
                <select
                  value={form.signatureId}
                  onChange={(e) => updateForm('signatureId', e.target.value)}
                  className="select-field !pr-8"
                >
                  <option value="">None</option>
                  {signatures.map((sig) => (
                    <option key={sig.id || sig._id} value={sig.id || sig._id}>
                      {sig.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <div className="flex items-center gap-1 mt-2">
                <a
                  href="/signatures"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <ExternalLink className="w-3 h-3" />
                  Create Signature
                </a>
              </div>
            </div>
          </fieldset>

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
              disabled={submitting || !form.name.trim() || !form.primaryDomain.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting
                ? (editingBrand ? 'Saving...' : 'Creating...')
                : (editingBrand ? 'Save Changes' : 'Create Brand')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
