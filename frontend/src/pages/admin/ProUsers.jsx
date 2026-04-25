import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Crown, Search } from 'lucide-react';

const PLAN_COLORS = {
  starter: 'badge-blue',
  pro: 'badge-purple',
  agency: 'badge-yellow',
};

export default function ProUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/admin/pro-users');
        setUsers(res.data?.users || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(s) ||
      u.full_name?.toLowerCase().includes(s) ||
      u.org_name?.toLowerCase().includes(s)
    );
  });

  const totalMrr = users.reduce((sum, u) => sum + Number(u.mrr_contribution || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pro Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          {users.length} paid user{users.length !== 1 ? 's' : ''} · ${totalMrr.toLocaleString()} MRR contribution
        </p>
      </div>

      <div className="card !py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or org…"
            className="input-field pl-9"
          />
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Crown className="w-10 h-10 mb-3" />
            <p className="text-sm">No pro users yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-header">User</th>
                  <th className="table-header">Organization</th>
                  <th className="table-header">Plan</th>
                  <th className="table-header">Seats</th>
                  <th className="table-header">MRR</th>
                  <th className="table-header">Sent 30d</th>
                  <th className="table-header">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-brand-50/30">
                    <td className="table-cell">
                      <div className="font-semibold text-gray-900">{u.full_name}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="table-cell">{u.org_name || '—'}</td>
                    <td className="table-cell">
                      <span className={`badge ${PLAN_COLORS[u.plan] || 'badge-gray'} capitalize`}>
                        {u.plan}
                      </span>
                    </td>
                    <td className="table-cell">{u.seats_used || 0} / {u.seats || 1}</td>
                    <td className="table-cell font-semibold text-emerald-600">
                      ${Number(u.mrr_contribution || 0).toFixed(2)}
                    </td>
                    <td className="table-cell">{(u.emails_sent_30d || 0).toLocaleString()}</td>
                    <td className="table-cell text-gray-500 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
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
