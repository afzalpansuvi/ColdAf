import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Loader2, Search, Ban, RotateCcw, Users } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qp = new URLSearchParams();
      if (search) qp.set('search', search);
      if (plan) qp.set('plan', plan);
      if (status) qp.set('status', status);
      const res = await api.get(`/admin/users?${qp.toString()}`);
      setUsers(res.data?.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, plan, status]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const suspend = async (id) => {
    if (!window.confirm('Suspend this user? They will be locked out of their account immediately.')) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.post(`/admin/users/${id}/suspend`);
      load();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to suspend user.');
    } finally {
      setActionLoading(false);
    }
  };
  const reactivate = async (id) => {
    setActionLoading(true);
    setError(null);
    try {
      await api.post(`/admin/users/${id}/reactivate`);
      load();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to reactivate user.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">{users.length} user{users.length !== 1 ? 's' : ''}</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card !py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="input-field pl-9"
            />
          </div>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="select-field w-36">
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="agency">Agency</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="select-field w-36">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-10 h-10 mb-3" />
            <p className="text-sm">No users match your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-header">User</th>
                  <th className="table-header">Organization</th>
                  <th className="table-header">Plan</th>
                  <th className="table-header">Role</th>
                  <th className="table-header">Last Login</th>
                  <th className="table-header">Status</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-brand-50/30">
                    <td className="table-cell">
                      <div className="font-semibold text-gray-900">{u.full_name}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="table-cell">{u.org_name || '—'}</td>
                    <td className="table-cell">
                      <span className="badge badge-purple capitalize">{u.plan || 'free'}</span>
                    </td>
                    <td className="table-cell text-xs capitalize">{u.role_name?.replace(/_/g, ' ')}</td>
                    <td className="table-cell text-gray-500">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      {u.is_active ? (
                        <button
                          onClick={() => suspend(u.id)}
                          disabled={actionLoading}
                          className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Suspend"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivate(u.id)}
                          disabled={actionLoading}
                          className="text-gray-400 hover:text-green-500 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Reactivate"
                        >
                          <RotateCcw className="w-4 h-4" />
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
    </div>
  );
}
