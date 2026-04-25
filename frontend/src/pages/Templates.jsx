import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import {
  Plus,
  Loader2,
  AlertTriangle,
  FileText,
  Search,
  LayoutGrid,
  List,
  Copy,
  Trash2,
  Pencil,
  Eye,
  Sparkles,
  Shuffle,
  Tag,
  X,
  RefreshCw,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'meeting_request', label: 'Meeting Request' },
  { value: 'case_study', label: 'Case Study' },
  { value: 'general', label: 'General' },
];

const CATEGORY_LABELS = {
  cold_outreach: 'Cold Outreach',
  follow_up: 'Follow Up',
  meeting_request: 'Meeting Request',
  case_study: 'Case Study',
  general: 'General',
};

const CATEGORY_COLORS = {
  cold_outreach: 'badge-blue',
  follow_up: 'badge-yellow',
  meeting_request: 'badge-purple',
  case_study: 'badge-green',
  general: 'badge-gray',
};

const DEFAULT_FORM = {
  name: '',
  brand_id: '',
  category: 'cold_outreach',
  subject: '',
  body_html: '',
  body_text: '',
  use_spintax: false,
  tags: '',
};

const PER_PAGE = 20;

// ── Spintax Helpers ──────────────────────────────────────────────────
function resolveSpintax(text) {
  return text.replace(/\{([^{}]+)\}/g, (_, options) => {
    const parts = options.split('|');
    return parts[Math.floor(Math.random() * parts.length)];
  });
}

function stripHtmlTags(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function truncate(str, len = 80) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function Templates() {
  const { isAdmin } = useAuth();

  // Data state
  const [templates, setTemplates] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filter state
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [formTab, setFormTab] = useState('edit'); // 'edit' | 'preview'
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Spintax preview
  const [spintaxVariations, setSpintaxVariations] = useState([]);

  // ── Fetch brands ──────────────────────────────────────────────────
  useEffect(() => {
    api.get('/brands')
      .then((res) => setBrands(res.data || []))
      .catch(() => {});
  }, []);

  // ── Fetch templates ───────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (brandFilter) params.set('brand_id', brandFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('page', page);
      params.set('limit', PER_PAGE);
      const qs = params.toString();
      const res = await api.get(`/templates${qs ? `?${qs}` : ''}`);
      setTemplates(res.data?.templates || res.data || []);
      setTotalCount(res.data?.total || res.data?.length || 0);
    } catch (err) {
      setError(err.message || 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, [brandFilter, categoryFilter, search, page]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [brandFilter, categoryFilter, search]);

  const totalPages = Math.ceil(totalCount / PER_PAGE) || 1;

  // ── Brand lookup ──────────────────────────────────────────────────
  const brandMap = useMemo(() => {
    const map = {};
    brands.forEach((b) => {
      map[b.id || b._id] = b.name;
    });
    return map;
  }, [brands]);

  // ── Form helpers ──────────────────────────────────────────────────
  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setForm({ ...DEFAULT_FORM });
    setFormError(null);
    setFormTab('edit');
    setSpintaxVariations([]);
    setShowCreateModal(true);
  };

  const openEdit = (template) => {
    setEditingTemplate(template);
    setForm({
      name: template.name || '',
      brand_id: template.brand_id || '',
      category: template.category || 'cold_outreach',
      subject: template.subject || '',
      body_html: template.body_html || '',
      body_text: template.body_text || '',
      use_spintax: template.use_spintax || false,
      tags: Array.isArray(template.tags) ? template.tags.join(', ') : (template.tags || ''),
    });
    setFormError(null);
    setFormTab('edit');
    setSpintaxVariations([]);
    setShowCreateModal(true);
  };

  const openView = (template) => {
    setViewingTemplate(template);
    setShowViewModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setEditingTemplate(null);
    setFormError(null);
  };

  const closeViewModal = () => {
    setShowViewModal(false);
    setViewingTemplate(null);
  };

  // ── Generate spintax variations ───────────────────────────────────
  const generateVariations = () => {
    const variations = [];
    for (let i = 0; i < 3; i++) {
      const subjectVariation = resolveSpintax(form.subject);
      const bodyText = form.body_html ? stripHtmlTags(form.body_html) : form.body_text;
      const firstParagraph = bodyText.split('\n').filter(Boolean)[0] || '';
      const bodyVariation = resolveSpintax(firstParagraph);
      variations.push({ subject: subjectVariation, body: bodyVariation });
    }
    setSpintaxVariations(variations);
  };

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        name: form.name.trim(),
        brand_id: form.brand_id || undefined,
        category: form.category,
        subject: form.subject,
        body_html: form.body_html,
        body_text: form.body_text || stripHtmlTags(form.body_html),
        use_spintax: form.use_spintax,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      if (editingTemplate) {
        const id = editingTemplate.id || editingTemplate._id;
        await api.put(`/templates/${id}`, payload);
      } else {
        await api.post('/templates', payload);
      }

      closeCreateModal();
      fetchTemplates();
    } catch (err) {
      setFormError(err.message || 'Failed to save template.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Duplicate ─────────────────────────────────────────────────────
  const handleDuplicate = async (template) => {
    try {
      const id = template.id || template._id;
      await api.post(`/templates/${id}/duplicate`);
      fetchTemplates();
    } catch (err) {
      setError(err.message || 'Failed to duplicate template.');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await api.delete(`/templates/${id}`);
      setDeleteConfirmId(null);
      fetchTemplates();
    } catch (err) {
      setError(err.message || 'Failed to delete template.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────
  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading templates...</p>
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
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Email Templates</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {totalCount} template{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card dark:bg-gray-800 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Brand filter */}
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="select-field sm:w-48"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b.id || b._id} value={b.id || b._id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="select-field sm:w-48"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Templates Content */}
      {templates.length === 0 ? (
        <div className="card dark:bg-gray-800 dark:border-gray-700 flex flex-col items-center justify-center py-16 text-gray-400">
          <FileText className="w-10 h-10 mb-3" />
          <p className="text-sm font-medium">No templates found</p>
          <p className="text-xs mt-1">
            {search || brandFilter || categoryFilter
              ? 'Try adjusting your filters.'
              : 'Create your first email template to get started.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const tplId = tpl.id || tpl._id;
            return (
              <div
                key={tplId}
                className="card dark:bg-gray-800 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => openView(tpl)}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate flex-1">
                    {tpl.name}
                  </h3>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {tpl.use_spintax && (
                      <span className="badge badge-purple" title="Uses Spintax">
                        <Shuffle className="w-3 h-3 mr-1" />
                        Spintax
                      </span>
                    )}
                    {tpl.is_ai_generated && (
                      <span className="badge badge-blue" title="AI Generated">
                        <Sparkles className="w-3 h-3 mr-1" />
                        AI
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-1">
                  <span className="font-medium text-gray-500 dark:text-gray-500">Subject:</span>{' '}
                  {truncate(tpl.subject, 60)}
                </p>

                <div className="flex items-center flex-wrap gap-2 mb-3">
                  <span className={`badge ${CATEGORY_COLORS[tpl.category] || 'badge-gray'}`}>
                    {CATEGORY_LABELS[tpl.category] || tpl.category}
                  </span>
                  {tpl.brand_id && brandMap[tpl.brand_id] && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {brandMap[tpl.brand_id]}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <span>
                    {tpl.created_at
                      ? format(new Date(tpl.created_at), 'MMM d, yyyy')
                      : ''}
                  </span>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(tpl); }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(tpl); }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(tplId); }}
                        className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="card dark:bg-gray-800 dark:border-gray-700 overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="table-header">Name</th>
                  <th className="table-header">Subject</th>
                  <th className="table-header">Brand</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Flags</th>
                  <th className="table-header">Created</th>
                  {isAdmin && <th className="table-header text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className=" dark:divide-gray-700">
                {templates.map((tpl) => {
                  const tplId = tpl.id || tpl._id;
                  return (
                    <tr
                      key={tplId}
                      className="hover:bg-brand-50/30 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                      onClick={() => openView(tpl)}
                    >
                      <td className="table-cell font-medium text-gray-800 dark:text-gray-100">
                        {tpl.name}
                      </td>
                      <td className="table-cell max-w-xs truncate">
                        {truncate(tpl.subject, 50)}
                      </td>
                      <td className="table-cell">
                        {tpl.brand_id && brandMap[tpl.brand_id]
                          ? brandMap[tpl.brand_id]
                          : '-'}
                      </td>
                      <td className="table-cell">
                        <span className={`badge ${CATEGORY_COLORS[tpl.category] || 'badge-gray'}`}>
                          {CATEGORY_LABELS[tpl.category] || tpl.category}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          {tpl.use_spintax && (
                            <span className="badge badge-purple text-[10px]">Spintax</span>
                          )}
                          {tpl.is_ai_generated && (
                            <span className="badge badge-blue text-[10px]">AI</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        {tpl.created_at
                          ? format(new Date(tpl.created_at), 'MMM d, yyyy')
                          : '-'}
                      </td>
                      {isAdmin && (
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(tpl); }}
                              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-500 dark:text-gray-400"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDuplicate(tpl); }}
                              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-500 dark:text-gray-400"
                              title="Duplicate"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(tplId); }}
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────── */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Template"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this template? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="btn-secondary"
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(deleteConfirmId)}
              disabled={deleting}
              className="btn-danger flex items-center gap-2"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── View Template Modal ────────────────────────────────────── */}
      <Modal
        isOpen={showViewModal}
        onClose={closeViewModal}
        title={viewingTemplate?.name || 'Template Detail'}
        size="xl"
      >
        {viewingTemplate && (
          <div className="space-y-4">
            <div className="flex items-center flex-wrap gap-2">
              <span className={`badge ${CATEGORY_COLORS[viewingTemplate.category] || 'badge-gray'}`}>
                {CATEGORY_LABELS[viewingTemplate.category] || viewingTemplate.category}
              </span>
              {viewingTemplate.use_spintax && (
                <span className="badge badge-purple">
                  <Shuffle className="w-3 h-3 mr-1" />
                  Spintax
                </span>
              )}
              {viewingTemplate.is_ai_generated && (
                <span className="badge badge-blue">
                  <Sparkles className="w-3 h-3 mr-1" />
                  AI Generated
                </span>
              )}
              {viewingTemplate.brand_id && brandMap[viewingTemplate.brand_id] && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Brand: {brandMap[viewingTemplate.brand_id]}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Subject
              </label>
              <p className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                {viewingTemplate.subject}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Body Preview
              </label>
              <div
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-700 text-sm max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: viewingTemplate.body_html || viewingTemplate.body_text || '' }}
              />
            </div>

            {viewingTemplate.tags && viewingTemplate.tags.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(viewingTemplate.tags) ? viewingTemplate.tags : []).map((tag, i) => (
                    <span key={i} className="badge badge-gray">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-400 dark:text-gray-500">
              Created: {viewingTemplate.created_at ? format(new Date(viewingTemplate.created_at), 'MMM d, yyyy h:mm a') : 'N/A'}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => { closeViewModal(); openEdit(viewingTemplate); }}
                  className="btn-secondary btn-sm flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => { closeViewModal(); handleDuplicate(viewingTemplate); }}
                  className="btn-secondary btn-sm flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Create / Edit Template Modal ───────────────────────────── */}
      <Modal
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title={editingTemplate ? 'Edit Template' : 'Create Template'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Tab selector: Edit | Preview */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setFormTab('edit')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                formTab === 'edit'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setFormTab('preview')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                formTab === 'preview'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Eye className="w-3.5 h-3.5 inline mr-1" />
              Preview
            </button>
          </div>

          {formTab === 'edit' ? (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  required
                  placeholder="e.g. Q1 Outreach - SaaS"
                  className="input-field"
                />
              </div>

              {/* Brand + Category row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Brand
                  </label>
                  <select
                    value={form.brand_id}
                    onChange={(e) => updateForm('brand_id', e.target.value)}
                    className="select-field"
                  >
                    <option value="">No specific brand</option>
                    {brands.map((b) => (
                      <option key={b.id || b._id} value={b.id || b._id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => updateForm('category', e.target.value)}
                    className="select-field"
                  >
                    {CATEGORIES.filter((c) => c.value).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => updateForm('subject', e.target.value)}
                  placeholder="Quick question about {your company|your team}"
                  className="input-field"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Use {'{option1|option2}'} for spintax variations
                </p>
              </div>

              {/* Body HTML */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Body HTML
                </label>
                <textarea
                  value={form.body_html}
                  onChange={(e) => updateForm('body_html', e.target.value)}
                  rows={10}
                  placeholder="<p>Hi {{first_name}},</p>..."
                  className="input-field resize-none font-mono text-xs"
                />
              </div>

              {/* Body Plain Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Body Plain Text
                </label>
                <textarea
                  value={form.body_text}
                  onChange={(e) => updateForm('body_text', e.target.value)}
                  rows={4}
                  placeholder="Auto-generated from HTML if left empty"
                  className="input-field resize-none text-xs"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Leave blank to auto-generate from HTML (tags stripped)
                </p>
              </div>

              {/* Use Spintax toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateForm('use_spintax', !form.use_spintax)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.use_spintax ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.use_spintax ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Use Spintax
                </label>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => updateForm('tags', e.target.value)}
                  placeholder="outreach, saas, follow-up"
                  className="input-field"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Comma separated
                </p>
              </div>

              {/* Spintax Preview Section */}
              {form.use_spintax && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                      <Shuffle className="w-4 h-4" />
                      Spintax Preview
                    </h4>
                    <button
                      type="button"
                      onClick={generateVariations}
                      className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Generate Variations
                    </button>
                  </div>
                  {spintaxVariations.length > 0 ? (
                    <div className="space-y-3">
                      {spintaxVariations.map((v, i) => (
                        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-3 text-xs">
                          <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Variation {i + 1}
                          </p>
                          <p className="text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Subject:</span> {v.subject}
                          </p>
                          <p className="text-gray-600 dark:text-gray-400 mt-1">
                            <span className="font-medium">Body:</span> {truncate(v.body, 150)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      Click "Generate Variations" to preview 3 random spintax resolutions.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Preview tab */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Subject
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  {form.subject || '(no subject)'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Body Preview
                </label>
                <div
                  className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-700 text-sm min-h-[200px] max-h-96 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: form.body_html || form.body_text || '<em>No content</em>' }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeCreateModal}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.name.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting
                ? (editingTemplate ? 'Saving...' : 'Creating...')
                : (editingTemplate ? 'Save Changes' : 'Create Template')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
