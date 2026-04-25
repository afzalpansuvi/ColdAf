import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, CreditCard, Gift, Check } from 'lucide-react';

const STATUS_COLORS = {
  active: 'badge-green',
  trialing: 'badge-blue',
  past_due: 'badge-yellow',
  canceled: 'badge-gray',
  unpaid: 'badge-red',
  comped: 'badge-purple',
};

const PLANS = ['free', 'starter', 'pro', 'agency'];

export default function AdminBilling() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/billing');
      setOrgs(res.data?.organizations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grantPlan = async (org, newPlan) => {
    if (newPlan === org.plan) return;
    const confirmMsg = `Grant ${newPlan.toUpperCase()} plan to "${org.name}" for free?\n\nNo payment will be taken. Stripe status will be set to "comped".`;
    if (!window.confirm(confirmMsg)) return;
    setGrantingId(org.id);
    try {
      await api.post(`/admin/orgs/${org.id}/grant-plan`, { plan: newPlan, note: 'Granted by platform owner' });
      setOrgs((prev) => prev.map((o) =>
        o.id === org.id ? { ...o, plan: newPlan, stripe_status: 'comped' } : o
      ));
      setFlashId(org.id);
      setTimeout(() => setFlashId(null), 1500);
    } catch (err) {
      alert(err.message || 'Failed to grant plan');
    } finally {
      setGrantingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing Overview</h1>
        <p className="text-sm text-gray-500 mt-1">
          {orgs.length} organization{orgs.length !== 1 ? 's' : ''} · Change a plan via the dropdown — "comped" orgs skip Stripe.
        </p>
      </div>

      <div className="card flex items-start gap-3 bg-gradient-to-br from-violet-50 to-purple-50 border border-purple-100">
        <Gift className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <div className="font-semibold text-gray-900">Comp a client for free</div>
          <div className="text-gray-600 mt-0.5">
            Select any plan from an org's dropdown below to grant it instantly — no payment required.
            The org's Stripe status becomes <code className="bg-white px-1.5 py-0.5 rounded text-xs">comped</code>,
            which bypasses renewal charges.
          </div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CreditCard className="w-10 h-10 mb-3" />
            <p className="text-sm">No organizations yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-header">Organization</th>
                  <th className="table-header">Current Plan</th>
                  <th className="table-header">Stripe Status</th>
                  <th className="table-header">Emails This Month</th>
                  <th className="table-header">Created</th>
                  <th className="table-header">Grant Plan</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => {
                  const isBusy = grantingId === o.id;
                  const flashed = flashId === o.id;
                  return (
                    <tr key={o.id} className={`hover:bg-brand-50/30 transition ${flashed ? 'bg-emerald-50' : ''}`}>
                      <td className="table-cell">
                        <div className="font-semibold text-gray-900">{o.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{String(o.id).slice(0, 8)}</div>
                      </td>
                      <td className="table-cell">
                        <span className="badge badge-purple capitalize">{o.plan || 'free'}</span>
                      </td>
                      <td className="table-cell">
                        <span className={`badge ${STATUS_COLORS[o.stripe_status] || 'badge-gray'} capitalize`}>
                          {o.stripe_status || 'none'}
                        </span>
                      </td>
                      <td className="table-cell">
                        {Number(o.emails_sent_this_month || 0).toLocaleString()}
                      </td>
                      <td className="table-cell text-gray-500 text-xs">
                        {o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <select
                            value={o.plan || 'free'}
                            onChange={(e) => grantPlan(o, e.target.value)}
                            disabled={isBusy}
                            className="select-field !py-1.5 !px-2 text-xs w-28"
                          >
                            {PLANS.map((p) => (
                              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                            ))}
                          </select>
                          {isBusy && <Loader2 className="w-4 h-4 animate-spin text-brand-600" />}
                          {flashed && <Check className="w-4 h-4 text-emerald-500" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
