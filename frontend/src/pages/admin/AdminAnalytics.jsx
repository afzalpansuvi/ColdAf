import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Loader2, Users, Mail, MessageSquare } from 'lucide-react';

function MiniBarChart({ data, color = '#8b5cf6' }) {
  if (!data || data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-sm text-gray-400">No data</div>;
  }
  const max = Math.max(...data.map((d) => d.count || 0), 1);
  return (
    <div className="h-32 flex items-end gap-1">
      {data.map((d, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t"
            style={{
              height: `${((d.count || 0) / max) * 100}%`,
              background: color,
              minHeight: '2px',
            }}
            title={`${d.date}: ${d.count}`}
          />
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/admin/analytics?range=${range}`);
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [range]);

  const total = (arr) => (arr || []).reduce((s, r) => s + (r.count || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Time-series metrics across all organizations</p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="select-field w-32"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Signups</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-3">{total(data?.signups)}</div>
            <MiniBarChart data={data?.signups} color="#3b82f6" />
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Emails Sent</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-3">{total(data?.emails)}</div>
            <MiniBarChart data={data?.emails} color="#8b5cf6" />
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Replies</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-3">{total(data?.replies)}</div>
            <MiniBarChart data={data?.replies} color="#10b981" />
          </div>
        </div>
      )}
    </div>
  );
}
