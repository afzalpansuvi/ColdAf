import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  FlaskConical,
  Users,
  Mail,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  GitBranch,
} from 'lucide-react';

// ── Tabs ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'leads', label: 'Leads', icon: Users },
  { key: 'abtests', label: 'A/B Tests', icon: FlaskConical },
  { key: 'emails', label: 'Emails', icon: Mail },
];

// ── Helpers ─────────────────────────────────────────────────────────
function pct(numerator, denominator) {
  if (!denominator || denominator === 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function fmtNum(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

function fmtDate(d) {
  if (!d) return '--';
  return format(new Date(d), 'MMM d, yyyy h:mm a');
}

function fmtDateShort(d) {
  if (!d) return '--';
  return format(new Date(d), 'MMM d, yyyy');
}

// ── Metric Card ─────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, iconBg }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Default A/B Test form ───────────────────────────────────────────
const DEFAULT_AB_FORM = {
  name: '',
  testType: 'subject_line',
  minSampleSize: 100,
  autoSelectWinner: true,
  variants: [
    { name: 'Variant A', variantType: 'subject_line', config: '{}' },
    { name: 'Variant B', variantType: 'subject_line', config: '{}' },
  ],
};

// ── Default Edit form ───────────────────────────────────────────────
const DEFAULT_EDIT_FORM = {
  name: '',
  description: '',
  dailyLimit: 50,
  minDelay: 30,
  maxDelay: 120,
  sendWindowStart: '09:00',
  sendWindowEnd: '17:00',
  followUpCount: 2,
  followUpDelays: [3, 5],
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function CampaignDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();

  // Campaign data
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab
  const [activeTab, setActiveTab] = useState('leads');

  // Leads tab
  const [leads, setLeads] = useState([]);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsLoading, setLeadsLoading] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState(null);

  // A/B Test modal
  const [showAbModal, setShowAbModal] = useState(false);
  const [abForm, setAbForm] = useState({ ...DEFAULT_AB_FORM });
  const [abSubmitting, setAbSubmitting] = useState(false);
  const [abError, setAbError] = useState(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ ...DEFAULT_EDIT_FORM });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  // ── Fetch campaign detail ─────────────────────────────────────────
  const fetchCampaign = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/campaigns/${id}`);
      setCampaign(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load campaign.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // ── Fetch leads ───────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const res = await api.get(`/campaigns/${id}/leads?page=${leadsPage}&limit=20`);
      const d = res.data || {};
      setLeads(d.leads || []);
      setLeadsTotal(d.total || 0);
      setLeadsTotalPages(d.totalPages || 1);
    } catch {
      // silently fail for leads tab
    } finally {
      setLeadsLoading(false);
    }
  }, [id, leadsPage]);

  useEffect(() => {
    if (activeTab === 'leads') {
      fetchLeads();
    }
  }, [activeTab, fetchLeads]);

  // ── Campaign actions ──────────────────────────────────────────────
  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      await api.post(`/campaigns/${id}/${action}`);
      await fetchCampaign();
    } catch (err) {
      setError(err.message || `Failed to ${action} campaign.`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Open edit modal pre-filled ────────────────────────────────────
  const openEditModal = () => {
    if (!campaign) return;
    setEditForm({
      name: campaign.name || '',
      description: campaign.description || '',
      dailyLimit: campaign.sendingConfig?.dailyLimit ?? campaign.dailyLimit ?? 50,
      minDelay: campaign.sendingConfig?.minDelay ?? campaign.minDelay ?? 30,
      maxDelay: campaign.sendingConfig?.maxDelay ?? campaign.maxDelay ?? 120,
      sendWindowStart: campaign.sendingConfig?.sendWindowStart ?? campaign.sendWindowStart ?? '09:00',
      sendWindowEnd: campaign.sendingConfig?.sendWindowEnd ?? campaign.sendWindowEnd ?? '17:00',
      sendDays: campaign.sendingConfig?.sendDays ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      followUpCount: campaign.followUpConfig?.count ?? campaign.followUpCount ?? 2,
      followUpDelays: campaign.followUpConfig?.delays ?? campaign.followUpDelays ?? [3, 5],
    });
    setEditError(null);
    setShowEditModal(true);
  };

  // ── Submit edit ───────────────────────────────────────────────────
  const handleEdit = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError(null);
    try {
      await api.put(`/campaigns/${id}`, {
        name: editForm.name,
        description: editForm.description,
        sendingConfig: {
          dailyLimit: editForm.dailyLimit,
          minDelay: editForm.minDelay,
          maxDelay: editForm.maxDelay,
          sendWindowStart: editForm.sendWindowStart,
          sendWindowEnd: editForm.sendWindowEnd,
          sendDays: editForm.sendDays,
        },
        followUpConfig: {
          count: editForm.followUpCount,
          delays: editForm.followUpDelays.slice(0, editForm.followUpCount),
        },
      });
      setShowEditModal(false);
      await fetchCampaign();
    } catch (err) {
      setEditError(err.message || 'Failed to update campaign.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Submit A/B Test ───────────────────────────────────────────────
  const handleCreateAbTest = async (e) => {
    e.preventDefault();
    setAbSubmitting(true);
    setAbError(null);
    try {
      const variants = abForm.variants.map((v) => {
        let config = {};
        try { config = JSON.parse(v.config); } catch { config = {}; }
        return { name: v.name, variantType: abForm.testType, config };
      });
      await api.post('/ab-tests', {
        campaignId: id,
        name: abForm.name,
        testType: abForm.testType,
        minSampleSize: abForm.minSampleSize,
        autoSelectWinner: abForm.autoSelectWinner,
        variants,
      });
      setShowAbModal(false);
      setAbForm({ ...DEFAULT_AB_FORM });
      await fetchCampaign();
    } catch (err) {
      setAbError(err.message || 'Failed to create A/B test.');
    } finally {
      setAbSubmitting(false);
    }
  };

  // ── A/B form helpers ──────────────────────────────────────────────
  const updateAbVariant = (index, field, value) => {
    setAbForm((prev) => {
      const variants = [...prev.variants];
      variants[index] = { ...variants[index], [field]: value };
      return { ...prev, variants };
    });
  };

  const addAbVariant = () => {
    setAbForm((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        { name: `Variant ${String.fromCharCode(65 + prev.variants.length)}`, variantType: prev.testType, config: '{}' },
      ],
    }));
  };

  const removeAbVariant = (index) => {
    if (abForm.variants.length <= 2) return;
    setAbForm((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  // ── Edit form helpers ─────────────────────────────────────────────
  const updateEditField = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditFollowUpCount = (count) => {
    const c = Math.max(0, Math.min(5, parseInt(count, 10) || 0));
    setEditForm((prev) => {
      const delays = [...prev.followUpDelays];
      while (delays.length < c) delays.push(3);
      return { ...prev, followUpCount: c, followUpDelays: delays.slice(0, c) };
    });
  };

  const toggleEditSendDay = (day) => {
    setEditForm((prev) => ({
      ...prev,
      sendDays: prev.sendDays?.includes(day)
        ? prev.sendDays.filter((d) => d !== day)
        : [...(prev.sendDays || []), day],
    }));
  };

  // ── Which action buttons to show ──────────────────────────────────
  const status = campaign?.status?.toLowerCase();
  const canStart = status === 'draft';
  const canPause = status === 'active' || status === 'running';
  const canResume = status === 'paused';
  const canCancel = status !== 'cancelled' && status !== 'completed';

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (error && !campaign) {
    return (
      <div className="space-y-4">
        <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Campaigns
        </Link>
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (!campaign) return null;

  const totalSent = campaign.totalSent || 0;
  const totalOpened = campaign.totalOpened || 0;
  const totalClicked = campaign.totalClicked || 0;
  const totalReplied = campaign.totalReplied || 0;
  const totalBounced = campaign.totalBounced || 0;

  return (
    <div className="space-y-6">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <Link
        to="/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </Link>

      {/* ── Error banner ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold text-gray-800 truncate">{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {canStart && (
              <button
                onClick={() => handleAction('start')}
                disabled={!!actionLoading}
                className="btn-primary btn-sm flex items-center gap-1.5"
              >
                {actionLoading === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Start
              </button>
            )}
            {canPause && (
              <button
                onClick={() => handleAction('pause')}
                disabled={!!actionLoading}
                className="btn-secondary btn-sm flex items-center gap-1.5"
              >
                {actionLoading === 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                Pause
              </button>
            )}
            {canResume && (
              <button
                onClick={() => handleAction('resume')}
                disabled={!!actionLoading}
                className="btn-primary btn-sm flex items-center gap-1.5"
              >
                {actionLoading === 'resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Resume
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => handleAction('cancel')}
                disabled={!!actionLoading}
                className="btn-danger btn-sm flex items-center gap-1.5"
              >
                {actionLoading === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                Cancel
              </button>
            )}
            <button
              onClick={openEditModal}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <Link
              to={`/campaigns/${id}/sequence`}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Manage Sequence
            </Link>
          </div>
        )}
      </div>

      {/* ── Description ────────────────────────────────────────────── */}
      {campaign.description && (
        <p className="text-sm text-gray-500">{campaign.description}</p>
      )}

      {/* ── Overview Metrics ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          icon={Send}
          label="Total Sent"
          value={fmtNum(totalSent)}
          iconBg="bg-indigo-600"
        />
        <MetricCard
          icon={Eye}
          label="Opened"
          value={fmtNum(totalOpened)}
          sub={pct(totalOpened, totalSent)}
          iconBg="bg-green-600"
        />
        <MetricCard
          icon={MousePointerClick}
          label="Clicked"
          value={fmtNum(totalClicked)}
          sub={pct(totalClicked, totalSent)}
          iconBg="bg-amber-500"
        />
        <MetricCard
          icon={MessageSquare}
          label="Replied"
          value={fmtNum(totalReplied)}
          sub={pct(totalReplied, totalSent)}
          iconBg="bg-purple-600"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Bounced"
          value={fmtNum(totalBounced)}
          sub={pct(totalBounced, totalSent)}
          iconBg="bg-red-500"
        />
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
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

      {/* ── Tab Content ────────────────────────────────────────────── */}
      {activeTab === 'leads' && (
        <LeadsTab
          leads={leads}
          loading={leadsLoading}
          page={leadsPage}
          totalPages={leadsTotalPages}
          total={leadsTotal}
          onPageChange={setLeadsPage}
        />
      )}

      {activeTab === 'abtests' && (
        <AbTestsTab
          abTests={campaign.abTests || []}
          isAdmin={isAdmin}
          onCreateClick={() => { setAbError(null); setShowAbModal(true); }}
        />
      )}

      {activeTab === 'emails' && (
        <EmailsTab emails={campaign.recentEmails || []} />
      )}

      {/* ── A/B Test Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={showAbModal}
        onClose={() => { setShowAbModal(false); setAbError(null); }}
        title="Create A/B Test"
        size="xl"
      >
        <form onSubmit={handleCreateAbTest} className="space-y-5">
          {abError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {abError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Test Name *</label>
            <input
              type="text"
              value={abForm.name}
              onChange={(e) => setAbForm((p) => ({ ...p, name: e.target.value }))}
              required
              placeholder="e.g. Subject Line Test - March"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test Type</label>
              <div className="relative">
                <select
                  value={abForm.testType}
                  onChange={(e) => setAbForm((p) => ({ ...p, testType: e.target.value }))}
                  className="select-field !pr-8"
                >
                  <option value="subject_line">Subject Line</option>
                  <option value="body_style">Body Style</option>
                  <option value="send_time">Send Time</option>
                  <option value="multi_brand_strategy">Multi-Brand Strategy</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Sample Size</label>
              <input
                type="number"
                value={abForm.minSampleSize}
                onChange={(e) => setAbForm((p) => ({ ...p, minSampleSize: parseInt(e.target.value, 10) || 50 }))}
                min={10}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAbForm((p) => ({ ...p, autoSelectWinner: !p.autoSelectWinner }))}
              className="text-brand-600"
            >
              {abForm.autoSelectWinner ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
            </button>
            <span className="text-sm text-gray-700">Auto-select winner</span>
          </div>

          {/* Variants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Variants</label>
              <button
                type="button"
                onClick={addAbVariant}
                className="btn-secondary btn-sm flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Variant
              </button>
            </div>

            {abForm.variants.map((variant, idx) => (
              <div key={idx} className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-800">Variant {idx + 1}</span>
                  {abForm.variants.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeAbVariant(idx)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={variant.name}
                    onChange={(e) => updateAbVariant(idx, 'name', e.target.value)}
                    className="input-field"
                    placeholder="Variant name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Config (JSON)</label>
                  <textarea
                    value={variant.config}
                    onChange={(e) => updateAbVariant(idx, 'config', e.target.value)}
                    rows={3}
                    className="input-field resize-none font-mono text-xs"
                    placeholder='{ "subject": "Check this out" }'
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => { setShowAbModal(false); setAbError(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={abSubmitting || !abForm.name.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {abSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {abSubmitting ? 'Creating...' : 'Create A/B Test'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Campaign Modal ────────────────────────────────────── */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditError(null); }}
        title="Edit Campaign"
        size="xl"
      >
        <form onSubmit={handleEdit} className="space-y-5">
          {editError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {editError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => updateEditField('name', e.target.value)}
              required
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) => updateEditField('description', e.target.value)}
              rows={2}
              className="input-field resize-none"
            />
          </div>

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
                  value={editForm.dailyLimit}
                  onChange={(e) => updateEditField('dailyLimit', parseInt(e.target.value, 10) || 1)}
                  min={1}
                  max={1000}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Delay (sec)</label>
                <input
                  type="number"
                  value={editForm.minDelay}
                  onChange={(e) => updateEditField('minDelay', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Delay (sec)</label>
                <input
                  type="number"
                  value={editForm.maxDelay}
                  onChange={(e) => updateEditField('maxDelay', parseInt(e.target.value, 10) || 0)}
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
                  value={editForm.sendWindowStart}
                  onChange={(e) => updateEditField('sendWindowStart', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send Window End</label>
                <input
                  type="time"
                  value={editForm.sendWindowEnd}
                  onChange={(e) => updateEditField('sendWindowEnd', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Send Days</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const active = editForm.sendDays?.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleEditSendDay(day)}
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

          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-brand-600" />
              Follow-Up Configuration
            </legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Follow-Ups</label>
              <input
                type="number"
                value={editForm.followUpCount}
                onChange={(e) => handleEditFollowUpCount(e.target.value)}
                min={0}
                max={5}
                className="input-field !w-32"
              />
            </div>
            {editForm.followUpCount > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: editForm.followUpCount }).map((_, i) => (
                  <div key={i}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Follow-Up #{i + 1} Delay (days)
                    </label>
                    <input
                      type="number"
                      value={editForm.followUpDelays[i] || 3}
                      onChange={(e) => {
                        const delays = [...editForm.followUpDelays];
                        delays[i] = parseInt(e.target.value, 10) || 1;
                        updateEditField('followUpDelays', delays);
                      }}
                      min={1}
                      max={60}
                      className="input-field"
                    />
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => { setShowEditModal(false); setEditError(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSubmitting || !editForm.name.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {editSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {editSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  LEADS TAB
// ═════════════════════════════════════════════════════════════════════
function LeadsTab({ leads, loading, page, totalPages, total, onPageChange }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="card text-center py-12">
        <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500">No leads in this campaign</p>
        <p className="text-xs text-gray-400 mt-1">Leads will appear here once they are assigned to this campaign.</p>
      </div>
    );
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 py-3 ">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{total.toLocaleString()}</span> lead{total !== 1 ? 's' : ''} total
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="">
              <th className="table-header">Name</th>
              <th className="table-header">Email</th>
              <th className="table-header">Status</th>
              <th className="table-header text-center">Follow-Up</th>
              <th className="table-header">Last Sent</th>
            </tr>
          </thead>
          <tbody className="">
            {leads.map((lead) => (
              <tr key={lead.id || lead._id} className="hover:bg-brand-50/30 transition-colors">
                <td className="table-cell font-medium text-gray-800">{lead.leadName || '--'}</td>
                <td className="table-cell text-gray-500">{lead.leadEmail || '--'}</td>
                <td className="table-cell">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="table-cell text-center">
                  {lead.followupStage != null ? (
                    <span className="badge badge-blue">Stage {lead.followupStage}</span>
                  ) : (
                    <span className="text-gray-400 text-xs">--</span>
                  )}
                </td>
                <td className="table-cell text-gray-500 whitespace-nowrap">
                  {fmtDateShort(lead.lastSentAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200">
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  A/B TESTS TAB
// ═════════════════════════════════════════════════════════════════════
function AbTestsTab({ abTests, isAdmin, onCreateClick }) {
  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={onCreateClick}
            className="btn-primary btn-sm flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Create A/B Test
          </button>
        </div>
      )}

      {(!abTests || abTests.length === 0) ? (
        <div className="card text-center py-12">
          <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No A/B tests yet</p>
          <p className="text-xs text-gray-400 mt-1">Create an A/B test to optimize your campaign performance.</p>
        </div>
      ) : (
        abTests.map((test) => (
          <div key={test.id || test._id} className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-gray-800">{test.name}</h3>
                <StatusBadge status={test.status} />
              </div>
              <span className="text-xs text-gray-400 capitalize">{test.testType?.replace(/_/g, ' ')}</span>
            </div>

            {test.variants && test.variants.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="">
                      <th className="table-header">Variant</th>
                      <th className="table-header text-right">Sent</th>
                      <th className="table-header text-right">Opened</th>
                      <th className="table-header text-right">Open Rate</th>
                      <th className="table-header text-right">Clicked</th>
                      <th className="table-header text-right">Click Rate</th>
                      <th className="table-header text-right">Replied</th>
                      <th className="table-header text-right">Reply Rate</th>
                    </tr>
                  </thead>
                  <tbody className="">
                    {test.variants.map((v, idx) => {
                      const sent = v.sent || v.totalSent || 0;
                      const opened = v.opened || v.totalOpened || 0;
                      const clicked = v.clicked || v.totalClicked || 0;
                      const replied = v.replied || v.totalReplied || 0;
                      return (
                        <tr key={v.id || v._id || idx} className="hover:bg-brand-50/30 transition-colors">
                          <td className="table-cell font-medium text-gray-800">{v.name}</td>
                          <td className="table-cell text-right tabular-nums">{fmtNum(sent)}</td>
                          <td className="table-cell text-right tabular-nums">{fmtNum(opened)}</td>
                          <td className="table-cell text-right tabular-nums">{pct(opened, sent)}</td>
                          <td className="table-cell text-right tabular-nums">{fmtNum(clicked)}</td>
                          <td className="table-cell text-right tabular-nums">{pct(clicked, sent)}</td>
                          <td className="table-cell text-right tabular-nums">{fmtNum(replied)}</td>
                          <td className="table-cell text-right tabular-nums">{pct(replied, sent)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  EMAILS TAB
// ═════════════════════════════════════════════════════════════════════
function EmailsTab({ emails }) {
  if (!emails || emails.length === 0) {
    return (
      <div className="card text-center py-12">
        <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500">No emails sent yet</p>
        <p className="text-xs text-gray-400 mt-1">Emails will appear here once the campaign starts sending.</p>
      </div>
    );
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="">
              <th className="table-header">Subject</th>
              <th className="table-header">To</th>
              <th className="table-header">Status</th>
              <th className="table-header">Sent</th>
            </tr>
          </thead>
          <tbody className="">
            {emails.map((email) => (
              <tr key={email.id || email._id} className="hover:bg-brand-50/30 transition-colors">
                <td className="table-cell font-medium text-gray-800 max-w-[280px] truncate" title={email.subject}>
                  {email.subject || '--'}
                </td>
                <td className="table-cell text-gray-500 max-w-[200px] truncate" title={email.toEmail}>
                  {email.toEmail || '--'}
                </td>
                <td className="table-cell">
                  <StatusBadge status={email.status} />
                </td>
                <td className="table-cell text-gray-500 whitespace-nowrap">
                  {fmtDate(email.sentAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
