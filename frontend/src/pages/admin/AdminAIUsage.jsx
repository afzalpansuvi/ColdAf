import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Sparkles, DollarSign, Cpu } from 'lucide-react';

const PROVIDER_COLORS = {
  openai: 'bg-emerald-500',
  anthropic: 'bg-amber-500',
  google: 'bg-blue-500',
};

export default function AdminAIUsage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/ai-usage');
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

  const byProvider = data?.byProvider || [];
  const totalTokens = byProvider.reduce((s, p) => s + (p.tokens || 0), 0);
  const totalCost = byProvider.reduce((s, p) => s + Number(p.cost || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Usage & Costs</h1>
        <p className="text-sm text-gray-500 mt-1">Cross-org token usage and spend</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <Cpu className="w-6 h-6 text-brand-600 mb-2" />
          <div className="text-3xl font-bold text-gray-900">
            {(totalTokens / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-sm text-gray-500">Tokens (30d)</div>
        </div>
        <div className="card">
          <DollarSign className="w-6 h-6 text-emerald-600 mb-2" />
          <div className="text-3xl font-bold text-gray-900">
            ${totalCost.toFixed(2)}
          </div>
          <div className="text-sm text-gray-500">Total spend (30d)</div>
        </div>
        <div className="card">
          <Sparkles className="w-6 h-6 text-amber-500 mb-2" />
          <div className="text-3xl font-bold text-gray-900">
            {(data?.requestCount || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Requests (30d)</div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Spend by Provider</h3>
        <div className="space-y-3">
          {byProvider.map((p) => {
            const pct = totalCost ? (Number(p.cost) / totalCost) * 100 : 0;
            return (
              <div key={p.provider}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-semibold capitalize text-gray-800">{p.provider}</span>
                  <span className="text-gray-500">
                    ${Number(p.cost || 0).toFixed(2)} · {(p.tokens / 1000).toFixed(1)}k tokens
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${PROVIDER_COLORS[p.provider] || 'bg-gray-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Top Spenders (30d)</h3>
        </div>
        {(data?.topSpenders || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Sparkles className="w-10 h-10 mb-3" />
            <p className="text-sm">No AI usage yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-header">Organization</th>
                  <th className="table-header">Plan</th>
                  <th className="table-header">Tokens</th>
                  <th className="table-header">Requests</th>
                  <th className="table-header">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topSpenders || []).map((o, idx) => (
                  <tr key={idx} className="hover:bg-brand-50/30">
                    <td className="table-cell font-semibold text-gray-900">{o.org_name}</td>
                    <td className="table-cell">
                      <span className="badge badge-purple capitalize">{o.plan}</span>
                    </td>
                    <td className="table-cell">{(o.tokens || 0).toLocaleString()}</td>
                    <td className="table-cell">{(o.request_count || 0).toLocaleString()}</td>
                    <td className="table-cell font-semibold text-emerald-600">
                      ${Number(o.cost || 0).toFixed(2)}
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
