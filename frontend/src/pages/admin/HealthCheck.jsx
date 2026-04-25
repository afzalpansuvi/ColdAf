import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

const STATUS_STYLES = {
  ok: { icon: CheckCircle, classes: 'text-green-600 bg-green-50 border-green-200', label: 'Healthy' },
  degraded: { icon: AlertCircle, classes: 'text-yellow-600 bg-yellow-50 border-yellow-200', label: 'Degraded' },
  down: { icon: XCircle, classes: 'text-red-600 bg-red-50 border-red-200', label: 'Down' },
  not_configured: { icon: AlertCircle, classes: 'text-gray-500 bg-gray-50 border-gray-200', label: 'Not configured' },
  unknown: { icon: AlertCircle, classes: 'text-gray-500 bg-gray-50 border-gray-200', label: 'Unknown' },
};

export default function HealthCheck() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/health');
      setData(res.data);
    } catch (err) {
      console.error('Health check fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-sm text-gray-500 mt-1">
            Last checked: {data?.checkedAt ? new Date(data.checkedAt).toLocaleString() : '—'}
          </p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.checks || []).map((check, idx) => {
            const style = STATUS_STYLES[check.status] || STATUS_STYLES.unknown;
            const Icon = style.icon;
            return (
              <div
                key={idx}
                className={`p-5 rounded-2xl border-2 ${style.classes}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {style.label}
                  </span>
                </div>
                <div className="text-lg font-bold text-gray-900 capitalize">{check.name}</div>
                {check.latencyMs != null && (
                  <div className="text-sm text-gray-600 mt-1">Latency: {check.latencyMs}ms</div>
                )}
                {check.meta && (
                  <div className="mt-3 text-xs text-gray-600 space-y-0.5">
                    {Object.entries(check.meta).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="capitalize">{k}:</span>
                        <span className="font-semibold">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {check.error && (
                  <div className="mt-3 text-xs text-red-700 font-mono break-all">{check.error}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
