import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { Loader2, CheckCircle, XCircle, Shield, Users, Building2, Mail, AlertTriangle, RefreshCw } from 'lucide-react';

export default function PlatformDashboard() {
  const [pending, setPending] = useState([]);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const fetchAll = useCallback(async () => {
    try {
      const [pendingRes, adminsRes, analyticsRes] = await Promise.all([
        api.get('/platform/super-admins/pending'),
        api.get('/platform/super-admins'),
        api.get('/platform/analytics'),
      ]);
      setPending(pendingRes.data?.data || []);
      setSuperAdmins(adminsRes.data?.data || []);
      setAnalytics(analyticsRes.data?.data || null);
    } catch (err) {
      console.error('Failed to load platform data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAction = async (userId, action) => {
    setActionLoading((prev) => ({ ...prev, [userId + action]: true }));
    try {
      await api.post(`/platform/super-admins/${userId}/${action}`);
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId + action]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Organizations" value={analytics.totalOrgs} color="purple" />
          <StatCard icon={Users} label="Total Users" value={analytics.totalUsers} color="blue" />
          <StatCard icon={Mail} label="Emails Sent" value={analytics.totalEmails?.toLocaleString()} color="green" />
          <StatCard icon={Shield} label="Super Admins" value={analytics.superAdminCounts?.total || 0} color="amber" />
        </div>
      )}

      {/* Pending Approvals */}
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.35)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.04)',
      }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Pending Approvals
            {pending.length > 0 && (
              <span className="ml-2 px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-700">{pending.length}</span>
            )}
          </h2>
          <button onClick={fetchAll} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No pending approval requests.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-4 rounded-xl bg-white/50 border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{req.fullName}</p>
                  <p className="text-xs text-gray-500">{req.email}</p>
                  {req.companyName && <p className="text-xs text-gray-400 mt-0.5">{req.companyName}</p>}
                  {req.reason && <p className="text-xs text-gray-400 italic mt-1">"{req.reason}"</p>}
                  <p className="text-[10px] text-gray-400 mt-1">Applied {new Date(req.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(req.userId, 'approve')}
                    disabled={actionLoading[req.userId + 'approve']}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-green-500 hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {actionLoading[req.userId + 'approve'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(req.userId, 'decline')}
                    disabled={actionLoading[req.userId + 'decline']}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {actionLoading[req.userId + 'decline'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Super Admins */}
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.35)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.04)',
      }}>
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-500" />
          Super Admins
        </h2>

        {superAdmins.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No super admins yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Orgs</th>
                  <th className="pb-3 pr-4">Joined</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {superAdmins.map((sa) => (
                  <tr key={sa.id} className="hover:bg-gray-50/50">
                    <td className="py-3 pr-4 font-medium text-gray-800">{sa.fullName}</td>
                    <td className="py-3 pr-4 text-gray-500">{sa.email}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={sa.status} />
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{sa.orgCount ?? 0}</td>
                    <td className="py-3 pr-4 text-gray-400 text-xs">{new Date(sa.createdAt).toLocaleDateString()}</td>
                    <td className="py-3">
                      {sa.status === 'approved' || sa.isActive ? (
                        <button
                          onClick={() => handleAction(sa.userId || sa.id, 'suspend')}
                          disabled={actionLoading[(sa.userId || sa.id) + 'suspend']}
                          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      ) : sa.status === 'suspended' ? (
                        <button
                          onClick={() => handleAction(sa.userId || sa.id, 'reactivate')}
                          disabled={actionLoading[(sa.userId || sa.id) + 'reactivate']}
                          className="text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                      ) : null}
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

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    purple: 'from-purple-500 to-violet-500',
    blue: 'from-blue-500 to-cyan-500',
    green: 'from-green-500 to-emerald-500',
    amber: 'from-amber-500 to-orange-500',
  };
  return (
    <div className="rounded-2xl p-5" style={{
      background: 'rgba(255, 255, 255, 0.72)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.35)',
      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.04)',
    }}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center shadow-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-800">{value ?? '—'}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    approved: 'bg-green-100 text-green-700',
    active: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
    declined: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}
