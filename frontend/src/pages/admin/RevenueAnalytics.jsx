import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, DollarSign, TrendingUp } from 'lucide-react';

const PLAN_COLORS = {
  free: '#9ca3af',
  starter: '#3b82f6',
  pro: '#8b5cf6',
  agency: '#f59e0b',
};

export default function RevenueAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/revenue');
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const history = data?.history || [];
  const maxMrr = Math.max(...history.map((h) => h.mrr || 0), 1);
  const totalOrgs = (data?.planBreakdown || []).reduce((s, p) => s + (p.count || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Revenue Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">MRR, ARR, and plan breakdown</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <DollarSign className="w-6 h-6 text-emerald-600 mb-2" />
          <div className="text-3xl font-bold text-gray-900">
            ${Number(data?.mrr || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Monthly Recurring Revenue</div>
        </div>
        <div className="card">
          <TrendingUp className="w-6 h-6 text-blue-600 mb-2" />
          <div className="text-3xl font-bold text-gray-900">
            ${Number(data?.arr || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Annual Recurring Revenue</div>
        </div>
        <div className="card">
          <div className="text-3xl font-bold text-gray-900 mt-6">
            {Number(data?.churn || 0)}%
          </div>
          <div className="text-sm text-gray-500">Churn (30d)</div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-4">MRR History (12 months)</h3>
        <div className="h-48 flex items-end gap-2">
          {history.map((h, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-gradient-to-t from-violet-500 to-purple-400"
                style={{
                  height: `${((h.mrr || 0) / maxMrr) * 100}%`,
                  minHeight: '4px',
                }}
                title={`${h.month}: $${h.mrr}`}
              />
              <div className="text-[10px] text-gray-500 mt-1">{h.month.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Plan Breakdown</h3>
        <div className="space-y-3">
          {(data?.planBreakdown || []).map((p) => {
            const pct = totalOrgs ? (p.count / totalOrgs) * 100 : 0;
            return (
              <div key={p.plan}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-semibold capitalize text-gray-800">{p.plan}</span>
                  <span className="text-gray-500">
                    {p.count} {p.count === 1 ? 'org' : 'orgs'} · {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: PLAN_COLORS[p.plan] || '#9ca3af' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
