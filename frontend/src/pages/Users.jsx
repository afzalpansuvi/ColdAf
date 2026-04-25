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
  Users as UsersIcon,
  Pencil,
  Power,
  ChevronDown,
  Shield,
  Mail,
  Clock,
  UserCircle,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────
const ROLES = [
  { value: 'admin', label: 'Admin', id: 1 },
  { value: 'sales', label: 'Sales', id: 2 },
];

const DEFAULT_FORM = {
  fullName: '',
  email: '',
  password: '',
  roleId: 2,
  isActive: true,
};

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function Users() {
  const { isAdmin } = useAuth();

  // Data state
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // ── Fetch users ────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/users');
      setUsers(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Form helpers ────────────────────────────────────────────────────
  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const getRoleId = (roleName) => {
    const found = ROLES.find((r) => r.value === roleName);
    return found ? found.id : 2;
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm({ ...DEFAULT_FORM });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({
      fullName: user.fullName || '',
      email: user.email || '',
      password: '',
      roleId: user.roleId || getRoleId(user.roleName),
      isActive: user.isActive !== false,
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormError(null);
  };

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingUser) {
        const userId = editingUser.id || editingUser._id;
        await api.put(`/users/${userId}`, {
          fullName: form.fullName,
          email: form.email,
          roleId: form.roleId,
          isActive: form.isActive,
        });
      } else {
        if (!form.password || form.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await api.post('/users', {
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          roleId: form.roleId,
        });
      }

      closeModal();
      fetchUsers();
    } catch (err) {
      setFormError(err.message || 'Failed to save user.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Toggle active / deactivate ──────────────────────────────────────
  const handleToggleActive = async (user) => {
    const userId = user.id || user._id;
    try {
      if (user.isActive) {
        await api.delete(`/users/${userId}`);
      } else {
        await api.put(`/users/${userId}`, { isActive: true });
      }
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user status.');
    }
  };

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading users...</p>
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
          <h1 className="text-2xl font-bold text-gray-800">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {users.length} user{users.length !== 1 ? 's' : ''} total
          </p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add User
          </button>
        )}
      </div>

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
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <UsersIcon className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No users found</p>
            <p className="text-xs mt-1">Add your first user to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Name</th>
                  <th className="table-header">Email</th>
                  <th className="table-header">Role</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Last Login</th>
                  <th className="table-header">Created</th>
                  {isAdmin && <th className="table-header text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="">
                {users.map((u) => {
                  const userId = u.id || u._id;
                  return (
                    <tr key={userId} className="hover:bg-brand-50/30 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                            <UserCircle className="w-4 h-4 text-brand-600" />
                          </div>
                          <span className="font-medium text-gray-800 truncate max-w-[180px]">
                            {u.fullName || '--'}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate max-w-[200px]">{u.email}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                          u.roleName === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          <Shield className="w-3 h-3" />
                          {u.roleName
                            ? u.roleName.charAt(0).toUpperCase() + u.roleName.slice(1)
                            : 'User'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={u.isActive ? 'active' : 'inactive'} />
                      </td>
                      <td className="table-cell text-gray-500 whitespace-nowrap">
                        {u.lastLoginAt ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {format(new Date(u.lastLoginAt), 'MMM d, yyyy h:mm a')}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Never</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 whitespace-nowrap">
                        {u.createdAt
                          ? format(new Date(u.createdAt), 'MMM d, yyyy')
                          : '--'}
                      </td>
                      {isAdmin && (
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEdit(u)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(u)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                u.isActive
                                  ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                                  : 'text-green-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={u.isActive ? 'Deactivate' : 'Activate'}
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

      {/* ── Add / Edit User Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingUser ? 'Edit User' : 'Add User'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="flex items-center gap-3 p-3 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => updateForm('fullName', e.target.value)}
              required
              placeholder="John Doe"
              className="input-field"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              required
              placeholder="john@company.com"
              className="input-field"
            />
          </div>

          {/* Password (only for create) */}
          {!editingUser && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateForm('password', e.target.value)}
                required
                minLength={6}
                placeholder="Minimum 6 characters"
                className="input-field"
              />
              <p className="text-xs text-gray-400 mt-1">Must be at least 6 characters.</p>
            </div>
          )}

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="relative">
              <select
                value={form.roleId}
                onChange={(e) => updateForm('roleId', parseInt(e.target.value, 10))}
                className="select-field !pr-8"
              >
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Active toggle (only for edit) */}
          {editingUser && (
            <div className="flex items-center gap-3 py-1">
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
          )}

          {/* Actions */}
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
              disabled={submitting || !form.fullName.trim() || !form.email.trim() || (!editingUser && !form.password)}
              className="btn-primary flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting
                ? (editingUser ? 'Saving...' : 'Creating...')
                : (editingUser ? 'Save Changes' : 'Create User')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
