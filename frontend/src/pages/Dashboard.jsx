import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  Users,
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  Zap,
  Server,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  RefreshCw,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ─── Date range presets ──────────────────────────────────────────────

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function getPresetRange(days) {
  const now = new Date();
  return {
    from: days === 0 ? format(startOfDay(now), 'yyyy-MM-dd') : format(subDays(now, days), 'yyyy-MM-dd'),
    to: format(endOfDay(now), 'yyyy-MM-dd'),
  };
}

// ─── Colour palettes ─────────────────────────────────────────────────

const PIE_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316', '#6b7280'];

const AREA_COLORS = {
  sent: '#8b5cf6',
  opened: '#3b82f6',
  clicked: '#10b981',
};

// ─── Gradient configs for metric cards ───────────────────────────────

const METRIC_GRADIENTS = [
  { bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', shadow: 'rgba(124,58,237,0.3)' },
  { bg: 'linear-gradient(135deg, #6366f1, #4f46e5)', shadow: 'rgba(99,102,241,0.3)' },
  { bg: 'linear-gradient(135deg, #10b981, #059669)', shadow: 'rgba(16,185,129,0.3)' },
  { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', shadow: 'rgba(245,158,11,0.3)' },
  { bg: 'linear-gradient(135deg, #8b5cf6, #a855f7)', shadow: 'rgba(168,85,247,0.3)' },
  { bg: 'linear-gradient(135deg, #ef4444, #dc2626)', shadow: 'rgba(239,68,68,0.3)' },
  { bg: 'linear-gradient(135deg, #06b6d4, #0891b2)', shadow: 'rgba(6,182,212,0.3)' },
  { bg: 'linear-gradient(135deg, #64748b, #475569)', shadow: 'rgba(100,116,139,0.3)' },
];

// ─── Small reusable pieces ───────────────────────────────────────────

function TrendIndicator({ value }) {
  if (value == null) return null;
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
        <TrendingUp className="w-3.5 h-3.5" />
        {value.toFixed(1)}%
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500">
        <TrendingDown className="w-3.5 h-3.5" />
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400">
      <Minus className="w-3.5 h-3.5" />
      0%
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, trend, gradient }) {
  return (
    <div className="card flex items-start gap-4 group hover:scale-[1.02] transition-all duration-200">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: gradient.bg, boxShadow: `0 4px 15px ${gradient.shadow}` }}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-800 mt-0.5">{value}</p>
        <TrendIndicator value={trend} />
      </div>
    </div>
  );
}

function SmtpHealthValue({ summary }) {
  if (!summary) return <span className="text-xl font-bold text-gray-800">--</span>;
  const { healthy = 0, degraded = 0, failed = 0 } = summary;
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
        {healthy}
        <span className="text-xs font-normal text-gray-400">ok</span>
      </span>
      {degraded > 0 && (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500">
          {degraded}
          <span className="text-xs font-normal text-gray-400">warn</span>
        </span>
      )}
      {failed > 0 && (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-500">
          {failed}
          <span className="text-xs font-normal text-gray-400">fail</span>
        </span>
      )}
    </div>
  );
}

function GlassTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs" style={{
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.4)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
    }}>
      <p className="font-semibold text-gray-800 mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500 capitalize">{entry.dataKey}:</span>
          <span className="font-semibold text-gray-800">{entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-xl p-3 text-xs" style={{
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.4)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
    }}>
      <p className="font-semibold text-gray-800">{entry.name}</p>
      <p className="text-gray-500 mt-0.5">{entry.value?.toLocaleString()} leads</p>
    </div>
  );
}

// ─── Main Dashboard Component ────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();

  const defaultRange = getPresetRange(30);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [activePreset, setActivePreset] = useState('30d');

  const [brands, setBrands] = useState([]);
  const [brandId, setBrandId] = useState('');

  const [overview, setOverview] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [leadDistribution, setLeadDistribution] = useState([]);
  const [topSubjects, setTopSubjects] = useState([]);
  const [campaigns, setCampaigns] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/brands');
        if (!cancelled) setBrands(res.data || []);
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const qs = `date_from=${dateFrom}&date_to=${dateTo}${brandId ? `&brand_id=${brandId}` : ''}`;

    try {
      const [overviewRes, timelineRes, leadStatusRes, subjectsRes, campaignsRes] = await Promise.all([
        api.get(`/analytics/overview?${qs}`),
        api.get(`/analytics/timeline?date_from=${dateFrom}&date_to=${dateTo}`),
        api.get('/analytics/lead-status-distribution'),
        api.get('/analytics/top-subjects?limit=10'),
        api.get('/analytics/campaigns?limit=5'),
      ]);

      if (mountedRef.current) {
        setOverview(overviewRes.data || {});
        setTimeline(
          (timelineRes.data || []).map((d) => ({
            ...d,
            date: d.date ? format(new Date(d.date), 'MMM dd') : d.label || '',
          }))
        );
        setLeadDistribution(leadStatusRes.data || []);
        setTopSubjects(subjectsRes.data || []);
        setCampaigns(campaignsRes.data || []);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to load dashboard data.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dateFrom, dateTo, brandId]);

  useEffect(() => {
    fetchDashboard(false);
  }, [fetchDashboard]);

  useEffect(() => {
    mountedRef.current = true;
    const interval = setInterval(() => {
      fetchDashboard(true);
    }, 30_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchDashboard]);

  const handlePreset = (preset) => {
    setActivePreset(preset.label);
    const range = getPresetRange(preset.days);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleCustomDate = (field, value) => {
    setActivePreset('custom');
    if (field === 'from') setDateFrom(value);
    else setDateTo(value);
  };

  const fmtNum = (n) => {
    if (n == null) return '--';
    return Number(n).toLocaleString();
  };

  const fmtPct = (n) => {
    if (n == null) return '--';
    return `${Number(n).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Filters bar ──────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-400 flex-shrink-0" />
            <div className="flex items-center rounded-xl p-0.5" style={{
              background: 'rgba(139, 92, 246, 0.06)',
            }}>
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                    activePreset === preset.label
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-gray-500 hover:text-brand-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleCustomDate('from', e.target.value)}
              className="input-field !w-auto text-xs"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleCustomDate('to', e.target.value)}
              className="input-field !w-auto text-xs"
            />
          </div>

          {brands.length > 0 && (
            <div className="relative lg:ml-auto">
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="select-field text-xs !pr-8 min-w-[160px]"
              >
                <option value="">All Brands</option>
                {brands.map((b) => (
                  <option key={b.id || b._id} value={b.id || b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          )}

          <button
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="btn-secondary btn-sm flex items-center gap-1.5 lg:ml-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm" style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          color: '#dc2626',
        }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Metric cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Users} label="Total Leads" value={fmtNum(overview?.totalLeads)} trend={overview?.totalLeadsTrend} gradient={METRIC_GRADIENTS[0]} />
        <MetricCard icon={Send} label="Total Sent" value={fmtNum(overview?.totalSent)} trend={overview?.totalSentTrend} gradient={METRIC_GRADIENTS[1]} />
        <MetricCard icon={Eye} label="Open Rate" value={fmtPct(overview?.openRate)} trend={overview?.openRateTrend} gradient={METRIC_GRADIENTS[2]} />
        <MetricCard icon={MousePointerClick} label="Click Rate" value={fmtPct(overview?.clickRate)} trend={overview?.clickRateTrend} gradient={METRIC_GRADIENTS[3]} />
        <MetricCard icon={MessageSquare} label="Reply Rate" value={fmtPct(overview?.replyRate)} trend={overview?.replyRateTrend} gradient={METRIC_GRADIENTS[4]} />
        <MetricCard icon={AlertTriangle} label="Bounce Rate" value={fmtPct(overview?.bounceRate)} trend={overview?.bounceRateTrend} gradient={METRIC_GRADIENTS[5]} />
        <MetricCard icon={Zap} label="Active Campaigns" value={fmtNum(overview?.activeCampaigns)} trend={null} gradient={METRIC_GRADIENTS[6]} />
        {/* SMTP Health */}
        <div className="card flex items-start gap-4 group hover:scale-[1.02] transition-all duration-200">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: METRIC_GRADIENTS[7].bg, boxShadow: `0 4px 15px ${METRIC_GRADIENTS[7].shadow}` }}
          >
            <Server className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-500">SMTP Health</p>
            <SmtpHealthValue summary={overview?.smtpHealthSummary} />
          </div>
        </div>
      </div>

      {/* ── Timeline chart ───────────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Email Activity Timeline</h2>
        {timeline.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-sm text-gray-400">
            No timeline data available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={timeline} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AREA_COLORS.sent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={AREA_COLORS.sent} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AREA_COLORS.opened} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={AREA_COLORS.opened} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradClicked" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AREA_COLORS.clicked} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={AREA_COLORS.clicked} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={{ stroke: 'rgba(139,92,246,0.1)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<GlassTooltip />} />
              <Area type="monotone" dataKey="sent" stroke={AREA_COLORS.sent} strokeWidth={2.5} fill="url(#gradSent)" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              <Area type="monotone" dataKey="opened" stroke={AREA_COLORS.opened} strokeWidth={2.5} fill="url(#gradOpened)" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              <Area type="monotone" dataKey="clicked" stroke={AREA_COLORS.clicked} strokeWidth={2.5} fill="url(#gradClicked)" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center justify-center gap-6 mt-2">
          {Object.entries(AREA_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two-column: pie chart + top subjects ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Lead Status Distribution</h2>
          {leadDistribution.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">
              No lead status data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={leadDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  cornerRadius={4}
                >
                  {leadDistribution.map((entry, idx) => (
                    <Cell key={entry.name || idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-gray-500">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Top Performing Subject Lines</h2>
          {topSubjects.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">
              No subject line data available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Subject</th>
                    <th className="table-header text-right">Sent</th>
                    <th className="table-header text-right">Open %</th>
                    <th className="table-header text-right">Click %</th>
                  </tr>
                </thead>
                <tbody>
                  {topSubjects.map((row, idx) => (
                    <tr key={row.subject || idx} className="hover:bg-brand-50/30 transition-colors">
                      <td className="table-cell max-w-[220px] truncate font-medium text-gray-800" title={row.subject}>
                        {row.subject}
                      </td>
                      <td className="table-cell text-right tabular-nums">{fmtNum(row.sent)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtPct(row.openRate)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtPct(row.clickRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Campaign performance table ────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Campaign Performance</h2>
        {campaigns.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            No campaign data available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Campaign</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Sent</th>
                  <th className="table-header text-right">Opens</th>
                  <th className="table-header text-right">Open %</th>
                  <th className="table-header text-right">Clicks</th>
                  <th className="table-header text-right">Click %</th>
                  <th className="table-header text-right">Replies</th>
                  <th className="table-header text-right">Bounces</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, idx) => (
                  <tr key={c.id || c._id || idx} className="hover:bg-brand-50/30 transition-colors">
                    <td className="table-cell font-medium text-gray-800 max-w-[200px] truncate" title={c.name}>
                      {c.name}
                    </td>
                    <td className="table-cell">
                      <CampaignStatusBadge status={c.status} />
                    </td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.sent)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.opens)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtPct(c.openRate)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.clicks)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtPct(c.clickRate)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.replies)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.bounces)}</td>
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

function CampaignStatusBadge({ status }) {
  const styles = {
    active: 'badge-green',
    running: 'badge-green',
    paused: 'badge-yellow',
    completed: 'badge-blue',
    draft: 'badge-gray',
    failed: 'badge-red',
    cancelled: 'badge-red',
  };

  const cls = styles[status?.toLowerCase()] || 'badge-gray';

  return (
    <span className={`badge ${cls}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  );
}
