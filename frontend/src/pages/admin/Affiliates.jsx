import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Check, X, DollarSign, HeartHandshake } from 'lucide-react';

const STATUS_COLORS = {
  pending: 'badge-yellow',
  approved: 'badge-green',
  rejected: 'badge-red',
  suspended: 'badge-gray',
};

export default function Affiliates() {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/affiliates');
      setAffiliates(res.data?.affiliates || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    try { await api.post(`/admin/affiliates/${id}/approve`); load(); } catch (e) { alert(e.message); }
  };
  const reject = async (id) => {
    try { await api.post(`/admin/affiliates/${id}/reject`); load(); } catch (e) { alert(e.message); }
  };
  const pay = async (aff) => {
    const amount = prompt(`Amount to pay ${aff.user_name}?`, (aff.total_earned - aff.total_paid) || '0');
    if (!amount) return;
    try { await api.post(`/admin/affiliates/${aff.id}/pay`, { amount: parseFloat(amount) }); load(); } catch (e) { alert(e.message); }
  };

  const pending = affiliates.filter((a) => a.status === 'pending');
  const active = affiliates.filter((a) => a.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Affiliates</h1>
        <p className="text-sm text-gray-500 mt-1">{affiliates.length} affiliate{affiliates.length !== 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="card">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                Pending Applications ({pending.length})
              </h3>
              <div className="space-y-3">
                {pending.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div>
                      <div className="font-semibold text-gray-900">{a.user_name || a.user_email}</div>
                      <div className="text-xs text-gray-500">Code: <code className="font-mono">{a.code}</code> · {a.commission_pct}%</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approve(a.id)} className="btn-primary btn-sm flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => reject(a.id)} className="btn-secondary btn-sm flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card !p-0 overflow-hidden">
            {active.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <HeartHandshake className="w-10 h-10 mb-3" />
                <p className="text-sm">No active affiliates</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Affiliate</th>
                      <th className="table-header">Code</th>
                      <th className="table-header">Commission</th>
                      <th className="table-header">Referrals</th>
                      <th className="table-header">Earned</th>
                      <th className="table-header">Paid</th>
                      <th className="table-header">Status</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((a) => (
                      <tr key={a.id} className="hover:bg-brand-50/30">
                        <td className="table-cell">
                          <div className="font-semibold text-gray-900">{a.user_name || '—'}</div>
                          <div className="text-xs text-gray-500">{a.user_email}</div>
                        </td>
                        <td className="table-cell"><code className="font-mono text-xs">{a.code}</code></td>
                        <td className="table-cell">{a.commission_pct}%</td>
                        <td className="table-cell">{a.referral_count || 0}</td>
                        <td className="table-cell">${Number(a.total_earned || 0).toFixed(2)}</td>
                        <td className="table-cell">${Number(a.total_paid || 0).toFixed(2)}</td>
                        <td className="table-cell">
                          <span className={`badge ${STATUS_COLORS[a.status] || 'badge-gray'} capitalize`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="table-cell text-right">
                          {a.status === 'approved' && (
                            <button
                              onClick={() => pay(a)}
                              className="text-brand-600 hover:text-brand-700 p-1"
                              title="Pay commission"
                            >
                              <DollarSign className="w-4 h-4" />
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
        </>
      )}
    </div>
  );
}
