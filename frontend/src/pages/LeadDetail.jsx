import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  ArrowLeft,
  Pencil,
  Loader2,
  AlertTriangle,
  Mail,
  Phone,
  Building2,
  User,
  Tag,
  Globe,
  Calendar,
  FileText,
  MessageSquare,
  Send,
  ChevronDown,
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '--';
  return format(new Date(d), 'MMM d, yyyy h:mm a');
}

function fmtDateShort(d) {
  if (!d) return '--';
  return format(new Date(d), 'MMM d, yyyy');
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function LeadDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();

  // Lead data
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Brands for edit form
  const [brands, setBrands] = useState([]);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

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

  // ── Fetch lead detail ─────────────────────────────────────────────
  const fetchLead = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/leads/${id}`);
      setLead(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load lead.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  // ── Open edit modal ───────────────────────────────────────────────
  const openEditModal = () => {
    if (!lead) return;
    setEditForm({
      fullName: lead.fullName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      leadType: lead.leadType || '',
      industry: lead.industry || '',
      projectDetails: lead.projectDetails || '',
      brandId: lead.brandId || '',
    });
    setEditError(null);
    setShowEdit(true);
  };

  // ── Submit edit ───────────────────────────────────────────────────
  const handleEdit = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError(null);
    try {
      await api.put(`/leads/${id}`, {
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone || undefined,
        leadType: editForm.leadType || undefined,
        industry: editForm.industry || undefined,
        projectDetails: editForm.projectDetails || undefined,
        brandId: editForm.brandId || undefined,
      });
      setShowEdit(false);
      await fetchLead();
    } catch (err) {
      setEditError(err.message || 'Failed to update lead.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading lead...</p>
        </div>
      </div>
    );
  }

  if (error && !lead) {
    return (
      <div className="space-y-4">
        <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </Link>
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (!lead) return null;

  const emailsSent = lead.emailsSent || [];
  const replyMessages = lead.replyMessages || [];

  return (
    <div className="space-y-6">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <Link
        to="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </Link>

      {/* ── Lead Info Card ─────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0">
              {lead.fullName?.charAt(0)?.toUpperCase() || 'L'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{lead.fullName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={lead.status} />
              </div>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={openEditModal}
              className="btn-secondary btn-sm flex items-center gap-1.5 flex-shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Email */}
          <InfoField icon={Mail} label="Email">
            <a
              href={`mailto:${lead.email}`}
              className="text-brand-600 hover:text-brand-700 hover:underline"
            >
              {lead.email}
            </a>
          </InfoField>

          {/* Phone */}
          <InfoField icon={Phone} label="Phone">
            {lead.phone || '--'}
          </InfoField>

          {/* Industry */}
          <InfoField icon={Building2} label="Industry">
            {lead.industry || '--'}
          </InfoField>

          {/* Lead Type */}
          <InfoField icon={User} label="Lead Type">
            {lead.leadType || '--'}
          </InfoField>

          {/* Source */}
          <InfoField icon={Globe} label="Source">
            <span className="capitalize">{lead.sourceType?.replace(/_/g, ' ') || '--'}</span>
            {lead.sourceDetail && (
              <span className="text-gray-400 ml-1 text-xs">({lead.sourceDetail})</span>
            )}
          </InfoField>

          {/* Brand */}
          <InfoField icon={Tag} label="Brand">
            {lead.brandName || lead.brandId || '--'}
          </InfoField>

          {/* Date Added */}
          <InfoField icon={Calendar} label="Date Added">
            {fmtDateShort(lead.createdAt)}
          </InfoField>
        </div>

        {/* Project Details */}
        {lead.projectDetails && (
          <div className="mt-6 pt-5 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Details</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{lead.projectDetails}</p>
          </div>
        )}
      </div>

      {/* ── Enrichment Data ───────────────────────────────────────── */}
      {(lead.job_title || lead.company_name || lead.company_size || lead.linkedin_url || lead.recent_news || (lead.tech_stack && lead.tech_stack.length > 0)) && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-800">Enrichment Data</h2>
            {lead.enrichment_source && (
              <span className="badge badge-blue capitalize">{lead.enrichment_source}</span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lead.company_name && (
              <InfoField icon={Building2} label="Company">
                {lead.company_name}
              </InfoField>
            )}
            {lead.job_title && (
              <InfoField icon={User} label="Job Title">
                {lead.job_title}
              </InfoField>
            )}
            {lead.company_size && (
              <InfoField icon={User} label="Company Size">
                {lead.company_size} employees
              </InfoField>
            )}
            {lead.linkedin_url && (
              <InfoField icon={Globe} label="LinkedIn">
                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate block">
                  View Profile
                </a>
              </InfoField>
            )}
          </div>
          {lead.tech_stack && lead.tech_stack.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tech Stack</p>
              <div className="flex flex-wrap gap-1.5">
                {lead.tech_stack.map((tech, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-md">{tech}</span>
                ))}
              </div>
            </div>
          )}
          {lead.recent_news && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent News</p>
              <p className="text-sm text-gray-700 leading-relaxed">{lead.recent_news}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Email History ──────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-800">Email History</h2>
          <span className="badge badge-gray">{emailsSent.length}</span>
        </div>

        {emailsSent.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No emails sent to this lead yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Subject</th>
                  <th className="table-header">Campaign</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Sent</th>
                  <th className="table-header">Opened</th>
                </tr>
              </thead>
              <tbody className="">
                {emailsSent.map((email) => (
                  <tr key={email.id || email._id} className="hover:bg-brand-50/30 transition-colors">
                    <td className="table-cell font-medium text-gray-800 max-w-[240px] truncate" title={email.subject}>
                      {email.subject || '--'}
                    </td>
                    <td className="table-cell text-gray-500">
                      {email.campaignName || '--'}
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={email.status} />
                    </td>
                    <td className="table-cell text-gray-500 whitespace-nowrap">
                      {fmtDate(email.sentAt)}
                    </td>
                    <td className="table-cell text-gray-500 whitespace-nowrap">
                      {fmtDate(email.openedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Conversation ───────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-800">Conversation</h2>
          <span className="badge badge-gray">{replyMessages.length}</span>
        </div>

        {replyMessages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No messages in this conversation yet.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {replyMessages.map((msg) => {
              const isInbound = msg.direction === 'inbound';
              return (
                <div
                  key={msg.id || msg._id}
                  className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-3 ${
                      isInbound
                        ? 'bg-gray-100 text-gray-900 rounded-bl-sm'
                        : 'bg-brand-600 text-white rounded-br-sm'
                    }`}
                  >
                    {/* Header */}
                    <div className={`flex items-center gap-2 mb-1.5 ${isInbound ? 'text-gray-500' : 'text-brand-200'}`}>
                      {isInbound ? (
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <Send className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium truncate">
                        {isInbound ? msg.fromEmail : msg.toEmail}
                      </span>
                    </div>

                    {/* Subject */}
                    {msg.subject && (
                      <p className={`text-xs font-semibold mb-1 ${isInbound ? 'text-gray-700' : 'text-brand-100'}`}>
                        {msg.subject}
                      </p>
                    )}

                    {/* Body */}
                    <p className={`text-sm whitespace-pre-wrap leading-relaxed ${
                      isInbound ? 'text-gray-800' : 'text-white'
                    }`}>
                      {msg.bodyText}
                    </p>

                    {/* Timestamp */}
                    <p className={`text-[10px] mt-2 ${isInbound ? 'text-gray-400' : 'text-brand-200'}`}>
                      {fmtDate(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit Lead Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={showEdit}
        onClose={() => { setShowEdit(false); setEditError(null); }}
        title="Edit Lead"
        size="lg"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          {editError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {editError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={editForm.fullName}
                onChange={(e) => setEditForm((p) => ({ ...p, fullName: e.target.value }))}
                required
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                required
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead Type</label>
              <input
                type="text"
                value={editForm.leadType}
                onChange={(e) => setEditForm((p) => ({ ...p, leadType: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <input
                type="text"
                value={editForm.industry}
                onChange={(e) => setEditForm((p) => ({ ...p, industry: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <div className="relative">
                <select
                  value={editForm.brandId}
                  onChange={(e) => setEditForm((p) => ({ ...p, brandId: e.target.value }))}
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
              value={editForm.projectDetails}
              onChange={(e) => setEditForm((p) => ({ ...p, projectDetails: e.target.value }))}
              rows={4}
              className="input-field resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => { setShowEdit(false); setEditError(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSubmitting || !editForm.fullName?.trim() || !editForm.email?.trim()}
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
//  INFO FIELD
// ═════════════════════════════════════════════════════════════════════
function InfoField({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5">{children}</p>
      </div>
    </div>
  );
}
