import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Plus, Shield, Trash2, X } from 'lucide-react';

export default function AdminManagement() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'super_admin' });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/admins');
      setAdmins(res.data?.admins || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/admin/admins', form);
      setShowModal(false);
      setForm({ email: '', role: 'super_admin' });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this admin? They will lose admin access immediately.')) return;
    try {
      await api.delete(`/admin/admins/${id}`);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
          <p className="text-sm text-gray-500 mt-1">{admins.length} admin{admins.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Admin
        </button>
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Shield className="w-10 h-10 mb-3" />
            <p className="text-sm">No admins configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-header">Admin</th>
                  <th className="table-header">Role</th>
                  <th className="table-header">Added</th>
                  <th className="table-header">Last Active</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-brand-50/30">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-brand-600" />
                        <div>
                          <div className="font-semibold text-gray-900">{a.full_name || a.email}</div>
                          <div className="text-xs text-gray-500">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="badge badge-purple capitalize">{a.role?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="table-cell text-gray-500 text-xs">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="table-cell text-gray-500 text-xs">
                      {a.last_login_at ? new Date(a.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="table-cell text-right">
                      {!a.is_platform_owner && (
                        <button
                          onClick={() => remove(a.id)}
                          className="text-gray-400 hover:text-red-500 p-1"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Add Admin</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={create} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field"
                  placeholder="admin@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">User must already have a ColdAF account.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="select-field"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="support_admin">Support Admin</option>
                  <option value="billing_admin">Billing Admin</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
