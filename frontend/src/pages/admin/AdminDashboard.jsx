import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Building2, Users, Mail, DollarSign, TrendingUp, Activity, Loader2 } from 'lucide-react';

function KpiCard({ icon: Icon, label, value, suffix, gradient }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${gradient}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="text-3xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="text-lg text-gray-500 ml-1">{suffix}</span>}
      </div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/dashboard');
        setData(res.data || {});
      } catch (err) {
        console.error('Dashboard fetch failed', err);
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

  const d = data || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of all organizations and users</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Monthly Recurring Revenue"
          value={`$${Number(d.mrr || 0).toLocaleString()}`}
          gradient="bg-gradient-to-br from-emerald-500 to-green-600"
        />
        <KpiCard
          icon={Building2}
          label="Organizations"
          value={d.totalOrgs}
          gradient="bg-gradient-to-br from-purple-500 to-violet-600"
        />
        <KpiCard
          icon={Users}
          label="Active Users"
          value={d.totalUsers}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
        />
        <KpiCard
          icon={Mail}
          label="Emails Sent (30d)"
          value={d.emailsSent30d}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900">Annual Recurring Revenue</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            ${Number(d.arr || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Based on current MRR × 12 months
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900">Active Campaigns</h3>
          </div>
          <div className="text-4xl font-bold text-gray-900">
            {Number(d.activeCampaigns || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Currently running across all orgs
          </div>
        </div>
      </div>
    </div>
  );
}
