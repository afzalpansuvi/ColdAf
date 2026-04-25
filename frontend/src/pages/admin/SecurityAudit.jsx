import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Shield, AlertTriangle, Globe, Activity } from 'lucide-react';

const ACTION_COLORS = {
  'user.login': 'badge-green',
  'user.login.failed': 'badge-red',
  'user.signup': 'badge-blue',
  'user.logout': 'badge-gray',
  'campaign.send': 'badge-purple',
  'admin.action': 'badge-yellow',
};

export default function SecurityAudit() {
  const [audit, setAudit] = useState([]);
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [a, f] = await Promise.all([
          api.get('/admin/security/audit'),
          api.get('/admin/security/failed-logins'),
        ]);
        setAudit(a.data?.events || []);
        setFailed(f.data?.attempts || []);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security & Audit</h1>
        <p className="text-sm text-gray-500 mt-1">Platform-wide activity and threat monitoring</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900">Audit Log</h3>
          </div>
          {audit.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Shield className="w-10 h-10 mb-3" />
              <p className="text-sm">No audit events</p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-100">
              {audit.map((e) => (
                <div key={e.id} className="px-5 py-3 hover:bg-brand-50/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge ${ACTION_COLORS[e.action] || 'badge-gray'}`}>
                      {e.action}
                    </span>
                    <span className="text-xs text-gray-400">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">{e.user_email || 'system'}</span>
                    {e.target_type && (
                      <span className="text-gray-500"> · {e.target_type}{e.target_id ? ` #${e.target_id}` : ''}</span>
                    )}
                  </div>
                  {e.ip_address && (
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {e.ip_address}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card !p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="text-base font-semibold text-gray-900">Failed Logins (24h)</h3>
          </div>
          {failed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Shield className="w-8 h-8 mb-2" />
              <p className="text-xs">No failed attempts</p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-100">
              {failed.map((f, idx) => (
                <div key={idx} className="px-5 py-3">
                  <div className="text-sm font-medium text-gray-900">{f.email || 'unknown'}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {f.ip_address || '—'}
                    </span>
                    <span className="font-semibold text-red-500">{f.attempts}× attempts</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {f.last_attempt_at ? new Date(f.last_attempt_at).toLocaleString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
