import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format, subDays } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Loader2,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Clock,
  Mail,
  GitCompare,
  ArrowUpDown,
  ChevronUp,
} from 'lucide-react';

// ── Date helpers ─────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function getPresetRange(days) {
  const now = new Date();
  return {
    from: format(subDays(now, days), 'yyyy-MM-dd'),
    to: format(now, 'yyyy-MM-dd'),
  };
}

// ── Colour palettes ──────────────────────────────────────────────────
const AREA_COLORS = {
  sent: '#2563eb',
  opened: '#16a34a',
  clicked: '#f59e0b',
  replied: '#8b5cf6',
};

// ── Format helpers ───────────────────────────────────────────────────
const fmtNum = (n) => {
  if (n == null) return '--';
  return Number(n).toLocaleString();
};

const fmtPct = (n) => {
  if (n == null) return '--';
  return `${Number(n).toFixed(1)}%`;
};

// ── Reusable pieces ──────────────────────────────────────────────────
function ChangeIndicator({ value, invert = false }) {
  if (value == null) return null;
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;

  if (isPositive) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
        <TrendingUp className="w-3.5 h-3.5" />
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  }
  if (isNegative) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
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

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
      <p className="font-medium text-gray-800 mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 capitalize">{entry.dataKey}:</span>
          <span className="font-semibold text-gray-900">{entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sortable table header ────────────────────────────────────────────
function SortHeader({ label, sortKey, currentSort, currentDir, onSort, align = 'left' }) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={`table-header cursor-pointer select-none hover:text-gray-700 transition-colors ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {isActive ? (
          currentDir === 'asc' ? (
            <ChevronUp className="w-3 h-3 text-brand-600" />
          ) : (
            <ChevronDown className="w-3 h-3 text-brand-600" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 text-gray-300" />
        )}
      </div>
    </th>
  );
}

// ── Heatmap cell ─────────────────────────────────────────────────────
function HeatmapCell({ value, maxValue }) {
  const ratio = maxValue > 0 ? (value || 0) / maxValue : 0;
  // From light to dark blue
  const opacity = Math.max(0.05, ratio);
  return (
    <div
      className="w-full h-full min-h-[28px] rounded-sm flex items-center justify-center text-[10px] font-medium"
      style={{
        backgroundColor: `rgba(37, 99, 235, ${opacity})`,
        color: ratio > 0.5 ? '#fff' : ratio > 0.2 ? '#1e40af' : '#64748b',
      }}
      title={`${fmtPct(value)} open rate`}
    >
      {value != null && value > 0 ? fmtPct(value) : ''}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function Analytics() {
  const { user } = useAuth();

  // ── Filter state ───────────────────────────────────────────────────
  const defaultRange = getPresetRange(30);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [activePreset, setActivePreset] = useState('30d');

  const [brandId, setBrandId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [brands, setBrands] = useState([]);
  const [campaignsList, setCampaignsList] = useState([]);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compare2From, setCompare2From] = useState(() => {
    const r = getPresetRange(60);
    return r.from;
  });
  const [compare2To, setCompare2To] = useState(() => {
    const r = getPresetRange(30);
    return r.from;
  });
  const [comparison, setComparison] = useState(null);

  // ── Data state ─────────────────────────────────────────────────────
  const [funnel, setFunnel] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [campaignBreakdown, setCampaignBreakdown] = useState([]);
  const [brandBreakdown, setBrandBreakdown] = useState([]);
  const [smtpPerformance, setSmtpPerformance] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [topSubjects, setTopSubjects] = useState([]);
  const [responseTimes, setResponseTimes] = useState(null);

  // Sort state for campaign breakdown
  const [campSort, setCampSort] = useState('sent');
  const [campSortDir, setCampSortDir] = useState('desc');

  // Sort state for brand breakdown
  const [brandSort, setBrandSort] = useState('sent');
  const [brandSortDir, setBrandSortDir] = useState('desc');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Best send windows
  const [bestWindows, setBestWindows] = useState([]);

  // ── Fetch brands + campaigns for dropdowns ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [brandsRes, campaignsRes] = await Promise.all([
          api.get('/brands'),
          api.get('/campaigns?limit=200'),
        ]);
        if (!cancelled) {
          setBrands(brandsRes.data || []);
          const campsData = campaignsRes.data?.campaigns || campaignsRes.data || [];
          setCampaignsList(Array.isArray(campsData) ? campsData : []);
        }
      } catch {
        // non-critical
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Core data fetch ────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    const qs = (extra = {}) => {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (brandId) params.append('brand_id', brandId);
      if (campaignId) params.append('campaign_id', campaignId);
      Object.entries(extra).forEach(([k, v]) => {
        if (v != null) params.append(k, v);
      });
      return params.toString();
    };

    try {
      const requests = [
        api.get(`/analytics/funnel?${qs()}`),
        api.get(`/analytics/timeline?${qs()}`),
        api.get(`/analytics/campaigns?${qs()}`),
        api.get('/analytics/brands'),
        api.get('/analytics/smtp-performance'),
        api.get(`/analytics/send-time-heatmap?${qs()}`),
        api.get(`/analytics/top-subjects?${qs({ limit: 15 })}`),
        api.get(`/analytics/response-times?${qs()}`),
      ];

      if (compareMode) {
        requests.push(
          api.get(`/analytics/compare?period1_from=${dateFrom}&period1_to=${dateTo}&period2_from=${compare2From}&period2_to=${compare2To}`)
        );
      }

      const results = await Promise.all(requests);

      setFunnel(results[0].data || null);
      setTimeline(
        (results[1].data || []).map((d) => ({
          ...d,
          date: d.date ? format(new Date(d.date), 'MMM dd') : d.label || '',
        }))
      );
      setCampaignBreakdown(results[2].data || []);
      setBrandBreakdown(results[3].data || []);
      setSmtpPerformance(results[4].data || []);
      setHeatmap(results[5].data || []);
      setTopSubjects(results[6].data || []);
      setResponseTimes(results[7].data || null);

      if (compareMode && results[8]) {
        setComparison(results[8].data || null);
      } else {
        setComparison(null);
      }

      // Fetch best send windows using any available campaign
      try {
        const campsRes = await api.get('/campaigns?limit=1&status=active');
        const camps = campsRes.data?.campaigns || campsRes.data || [];
        const firstCampaignId = camps[0]?.id || camps[0]?._id;
        if (firstCampaignId) {
          const windowsRes = await api.get(`/campaigns/${firstCampaignId}/send-time-recommendation`);
          setBestWindows(windowsRes.data || []);
        } else {
          setBestWindows([]);
        }
      } catch {
        setBestWindows([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, brandId, campaignId, compareMode, compare2From, compare2To]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // ── Preset handler ─────────────────────────────────────────────────
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

  // ── Sort handlers ──────────────────────────────────────────────────
  const handleCampSort = (key) => {
    if (campSort === key) {
      setCampSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setCampSort(key);
      setCampSortDir('desc');
    }
  };

  const handleBrandSort = (key) => {
    if (brandSort === key) {
      setBrandSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setBrandSort(key);
      setBrandSortDir('desc');
    }
  };

  const sortedCampaigns = useMemo(() => {
    const arr = [...campaignBreakdown];
    arr.sort((a, b) => {
      const aVal = a[campSort] ?? 0;
      const bVal = b[campSort] ?? 0;
      return campSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return arr;
  }, [campaignBreakdown, campSort, campSortDir]);

  const sortedBrands = useMemo(() => {
    const arr = [...brandBreakdown];
    arr.sort((a, b) => {
      const aVal = a[brandSort] ?? 0;
      const bVal = b[brandSort] ?? 0;
      return brandSortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return arr;
  }, [brandBreakdown, brandSort, brandSortDir]);

  // ── Heatmap helpers ────────────────────────────────────────────────
  const heatmapGrid = useMemo(() => {
    // Build a 7x24 grid from the heatmap data
    const grid = Array.from({ length: 7 }, () => Array(24).fill(null));
    let maxVal = 0;
    (heatmap || []).forEach((entry) => {
      const day = entry.dayOfWeek ?? entry.day;
      const hour = entry.hour;
      const val = entry.openRate ?? entry.value ?? 0;
      if (day != null && hour != null && day >= 0 && day < 7 && hour >= 0 && hour < 24) {
        grid[day][hour] = val;
        if (val > maxVal) maxVal = val;
      }
    });
    return { grid, maxVal };
  }, [heatmap]);

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    if (i === 0) return '12a';
    if (i < 12) return `${i}a`;
    if (i === 12) return '12p';
    return `${i - 12}p`;
  });

  // ── Funnel helpers ─────────────────────────────────────────────────
  const funnelSteps = useMemo(() => {
    if (!funnel) return [];
    return [
      { label: 'Leads', value: funnel.leads ?? 0, key: 'leads' },
      { label: 'Queued', value: funnel.queued ?? 0, key: 'queued' },
      { label: 'Sent', value: funnel.sent ?? 0, key: 'sent' },
      { label: 'Opened', value: funnel.opened ?? 0, key: 'opened' },
      { label: 'Clicked', value: funnel.clicked ?? 0, key: 'clicked' },
      { label: 'Replied', value: funnel.replied ?? 0, key: 'replied' },
    ];
  }, [funnel]);

  const maxFunnel = useMemo(() => Math.max(...funnelSteps.map((s) => s.value), 1), [funnelSteps]);

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-gray-700 font-medium">Failed to load analytics</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button onClick={fetchAnalytics} className="btn-primary btn-sm mt-2">Retry</button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Filters bar ───────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Date presets */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activePreset === preset.label
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date inputs */}
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

            {/* Brand filter */}
            {brands.length > 0 && (
              <div className="relative">
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  className="select-field text-xs !pr-8 min-w-[150px]"
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

            {/* Campaign filter */}
            {campaignsList.length > 0 && (
              <div className="relative">
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="select-field text-xs !pr-8 min-w-[150px]"
                >
                  <option value="">All Campaigns</option>
                  {campaignsList.map((c) => (
                    <option key={c.id || c._id} value={c.id || c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            )}

            {/* Compare toggle */}
            <div className="flex items-center gap-2 lg:ml-auto">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={compareMode}
                  onChange={(e) => setCompareMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
              <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <GitCompare className="w-3.5 h-3.5" />
                Compare
              </span>
            </div>
          </div>

          {/* Compare date range */}
          {compareMode && (
            <div className="flex items-center gap-2 pl-6 border-t border-gray-100 pt-3">
              <span className="text-xs font-medium text-gray-500">Compare with:</span>
              <input
                type="date"
                value={compare2From}
                onChange={(e) => setCompare2From(e.target.value)}
                className="input-field !w-auto text-xs"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={compare2To}
                onChange={(e) => setCompare2To(e.target.value)}
                className="input-field !w-auto text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Comparison Summary ─────────────────────────────────────── */}
      {compareMode && comparison && (
        <div className="card">
          <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-brand-600" />
            Period Comparison
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Sent', key: 'sent' },
              { label: 'Opened', key: 'opened' },
              { label: 'Clicked', key: 'clicked' },
              { label: 'Replied', key: 'replied' },
              { label: 'Open Rate', key: 'openRate', isPct: true },
              { label: 'Reply Rate', key: 'replyRate', isPct: true },
            ].map(({ label, key, isPct }) => {
              const p1 = comparison.period1?.[key];
              const p2 = comparison.period2?.[key];
              const change = comparison.changes?.[key];
              return (
                <div key={key} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                  <div className="flex items-center justify-center gap-3">
                    <div>
                      <p className="text-xs text-gray-400">Period 1</p>
                      <p className="text-base font-bold text-gray-900">
                        {isPct ? fmtPct(p1) : fmtNum(p1)}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                    <div>
                      <p className="text-xs text-gray-400">Period 2</p>
                      <p className="text-base font-bold text-gray-900">
                        {isPct ? fmtPct(p2) : fmtNum(p2)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-1">
                    <ChangeIndicator value={change} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── a) Funnel Visualization ────────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-brand-600" />
          Conversion Funnel
        </h2>
        {funnelSteps.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">
            No funnel data available.
          </div>
        ) : (
          <div className="space-y-2">
            {funnelSteps.map((step, idx) => {
              const widthPct = Math.max((step.value / maxFunnel) * 100, 4);
              const prevValue = idx > 0 ? funnelSteps[idx - 1].value : null;
              const convRate = prevValue && prevValue > 0 ? ((step.value / prevValue) * 100).toFixed(1) : null;

              return (
                <div key={step.key} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600 w-16 text-right flex-shrink-0">
                    {step.label}
                  </span>
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                        style={{ width: `${widthPct}%`, minWidth: '40px' }}
                      >
                        <span className="text-xs font-bold text-white whitespace-nowrap">
                          {fmtNum(step.value)}
                        </span>
                      </div>
                    </div>
                    {convRate != null && (
                      <span className="text-[11px] text-gray-400 flex-shrink-0 w-14 text-right">
                        {convRate}%
                        <ArrowRight className="w-3 h-3 inline ml-0.5 -mt-0.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── b) Timeline Chart ──────────────────────────────────────── */}
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
                {Object.entries(AREA_COLORS).map(([key, color]) => (
                  <linearGradient key={key} id={`gradAnalytics_${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<TimelineTooltip />} />
              {Object.entries(AREA_COLORS).map(([key, color]) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#gradAnalytics_${key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-2">
          {Object.entries(AREA_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── c) Per-Campaign Breakdown ──────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Campaign Breakdown</h2>
        {sortedCampaigns.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No campaign data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Campaign</th>
                  <SortHeader label="Sent" sortKey="sent" currentSort={campSort} currentDir={campSortDir} onSort={handleCampSort} align="right" />
                  <SortHeader label="Opened" sortKey="opened" currentSort={campSort} currentDir={campSortDir} onSort={handleCampSort} align="right" />
                  <SortHeader label="Open %" sortKey="openRate" currentSort={campSort} currentDir={campSortDir} onSort={handleCampSort} align="right" />
                  <SortHeader label="Clicked" sortKey="clicked" currentSort={campSort} currentDir={campSortDir} onSort={handleCampSort} align="right" />
                  <SortHeader label="Click %" sortKey="clickRate" currentSort={campSort} currentDir={campSortDir} onSort={handleCampSort} align="right" />
                  <SortHeader label="Replied" sortKey="replied" currentSort={campSort} currentDir={campSortDir} onSort={handleCampSort} align="right" />
                  <SortHeader label="Bounced" sortKey="bounced" currentSort={campSort} currentDir={campSortDir} onSort={handleCampSort} align="right" />
                </tr>
              </thead>
              <tbody className="">
                {sortedCampaigns.map((c, idx) => (
                  <tr key={c.id || c._id || c.name || idx} className="hover:bg-brand-50/30 transition-colors">
                    <td className="table-cell font-medium text-gray-800 max-w-[200px] truncate" title={c.name}>
                      {c.name || '--'}
                    </td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.sent)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.opened)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtPct(c.openRate)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.clicked)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtPct(c.clickRate)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.replied)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(c.bounced)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── d) Per-Brand Breakdown ─────────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Brand Breakdown</h2>
        {sortedBrands.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No brand data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Brand</th>
                  <SortHeader label="Sent" sortKey="sent" currentSort={brandSort} currentDir={brandSortDir} onSort={handleBrandSort} align="right" />
                  <SortHeader label="Opened" sortKey="opened" currentSort={brandSort} currentDir={brandSortDir} onSort={handleBrandSort} align="right" />
                  <SortHeader label="Open %" sortKey="openRate" currentSort={brandSort} currentDir={brandSortDir} onSort={handleBrandSort} align="right" />
                  <SortHeader label="Clicked" sortKey="clicked" currentSort={brandSort} currentDir={brandSortDir} onSort={handleBrandSort} align="right" />
                  <SortHeader label="Replied" sortKey="replied" currentSort={brandSort} currentDir={brandSortDir} onSort={handleBrandSort} align="right" />
                  <SortHeader label="Reply %" sortKey="replyRate" currentSort={brandSort} currentDir={brandSortDir} onSort={handleBrandSort} align="right" />
                  <SortHeader label="Bounced" sortKey="bounced" currentSort={brandSort} currentDir={brandSortDir} onSort={handleBrandSort} align="right" />
                </tr>
              </thead>
              <tbody className="">
                {sortedBrands.map((b, idx) => (
                  <tr key={b.id || b._id || b.name || idx} className="hover:bg-brand-50/30 transition-colors">
                    <td className="table-cell font-medium text-gray-800 max-w-[200px] truncate" title={b.name}>
                      {b.name || '--'}
                    </td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(b.sent)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(b.opened)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtPct(b.openRate)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(b.clicked)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(b.replied)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtPct(b.replyRate)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(b.bounced)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── e) SMTP Performance ────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4">SMTP Performance</h2>
        {smtpPerformance.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No SMTP performance data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="">
                  <th className="table-header">Account</th>
                  <th className="table-header">Brand</th>
                  <th className="table-header text-right">Sent</th>
                  <th className="table-header text-right">Delivered</th>
                  <th className="table-header text-right">Delivery %</th>
                  <th className="table-header text-right">Bounced</th>
                  <th className="table-header text-right">Bounce %</th>
                  <th className="table-header text-right">Avg Speed</th>
                  <th className="table-header">Health</th>
                </tr>
              </thead>
              <tbody className="">
                {smtpPerformance.map((s, idx) => (
                  <tr key={s.id || s._id || s.emailAddress || idx} className="hover:bg-brand-50/30 transition-colors">
                    <td className="table-cell font-medium text-gray-800 max-w-[200px] truncate" title={s.emailAddress}>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {s.emailAddress || '--'}
                      </div>
                    </td>
                    <td className="table-cell">
                      {s.brandName ? (
                        <span className="badge badge-blue">{s.brandName}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">--</span>
                      )}
                    </td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(s.sent)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(s.delivered)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtPct(s.deliveryRate)}</td>
                    <td className="table-cell text-right tabular-nums">{fmtNum(s.bounced)}</td>
                    <td className="table-cell text-right tabular-nums">
                      <span className={
                        (s.bounceRate || 0) > 5 ? 'text-red-600 font-medium' :
                        (s.bounceRate || 0) > 2 ? 'text-amber-600' : ''
                      }>
                        {fmtPct(s.bounceRate)}
                      </span>
                    </td>
                    <td className="table-cell text-right tabular-nums text-gray-500">
                      {s.avgSendTime != null ? `${s.avgSendTime.toFixed(1)}s` : '--'}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${
                        s.healthStatus === 'healthy' ? 'badge-green' :
                        s.healthStatus === 'degraded' ? 'badge-yellow' :
                        s.healthStatus === 'failed' ? 'badge-red' : 'badge-gray'
                      }`}>
                        {s.healthStatus ? s.healthStatus.charAt(0).toUpperCase() + s.healthStatus.slice(1) : 'Unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── f0) Best Send Windows summary ─────────────────────────── */}
      {bestWindows.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600" />
            Best Send Windows
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {bestWindows.map((w, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border flex items-center gap-4 ${
                  idx === 0
                    ? 'border-brand-300 bg-brand-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    idx === 0
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{w.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {w.isDefault
                      ? 'Recommended default'
                      : w.openRate != null
                      ? `${(w.openRate * 100).toFixed(1)}% open rate`
                      : 'Historical data'}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Based on historical open patterns for your active campaigns. Enable AI Send-Time Optimization on a campaign to automatically schedule sends to these windows.
          </p>
        </div>
      )}

      {/* ── f) Send Time Heatmap ───────────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-600" />
          Send Time Heatmap (Open Rate by Day &amp; Hour)
        </h2>
        {heatmap.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No heatmap data available for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Hour labels */}
              <div className="flex mb-1">
                <div className="w-10 flex-shrink-0" />
                {hourLabels.map((h, i) => (
                  <div key={i} className="flex-1 text-center text-[10px] text-gray-400 font-medium">
                    {i % 3 === 0 ? h : ''}
                  </div>
                ))}
              </div>
              {/* Grid rows */}
              {dayLabels.map((day, dayIdx) => (
                <div key={day} className="flex items-center gap-1 mb-1">
                  <span className="w-10 flex-shrink-0 text-right text-[11px] text-gray-500 font-medium pr-2">
                    {day}
                  </span>
                  {Array.from({ length: 24 }, (_, hourIdx) => (
                    <div key={hourIdx} className="flex-1">
                      <HeatmapCell
                        value={heatmapGrid.grid[dayIdx]?.[hourIdx]}
                        maxValue={heatmapGrid.maxVal}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center justify-end gap-2 mt-3 pr-1">
                <span className="text-[10px] text-gray-400">Low</span>
                <div className="flex gap-0.5">
                  {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map((opacity) => (
                    <div
                      key={opacity}
                      className="w-5 h-3 rounded-sm"
                      style={{ backgroundColor: `rgba(37, 99, 235, ${opacity})` }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-gray-400">High</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Two-column: Top Subjects + Response Times ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── g) Top Subject Lines ──────────────────────────────────── */}
        <div className="lg:col-span-2 card">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Top Subject Lines</h2>
          {topSubjects.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              No subject line data available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="table-header">#</th>
                    <th className="table-header">Subject</th>
                    <th className="table-header text-right">Sent</th>
                    <th className="table-header text-right">Open %</th>
                    <th className="table-header text-right">Click %</th>
                    <th className="table-header text-right">Reply %</th>
                  </tr>
                </thead>
                <tbody className="">
                  {topSubjects.map((row, idx) => (
                    <tr key={row.subject || idx} className="hover:bg-brand-50/30 transition-colors">
                      <td className="table-cell text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="table-cell max-w-[280px] truncate font-medium text-gray-800" title={row.subject}>
                        {row.subject}
                      </td>
                      <td className="table-cell text-right tabular-nums">{fmtNum(row.sent)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtPct(row.openRate)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtPct(row.clickRate)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtPct(row.replyRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── h) Response Time Stats ───────────────────────────────── */}
        <div className="card">
          <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600" />
            Response Times
          </h2>
          {!responseTimes ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              No response time data available.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-brand-50 rounded-lg text-center">
                <p className="text-xs font-medium text-brand-600 uppercase tracking-wider">Average Response</p>
                <p className="text-3xl font-bold text-brand-700 mt-1">
                  {responseTimes.avgHours != null ? `${responseTimes.avgHours.toFixed(1)}h` : '--'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Median</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {responseTimes.medianHours != null ? `${responseTimes.medianHours.toFixed(1)}h` : '--'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Fastest</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {responseTimes.minHours != null ? `${responseTimes.minHours.toFixed(1)}h` : '--'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Slowest</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {responseTimes.maxHours != null ? `${responseTimes.maxHours.toFixed(1)}h` : '--'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Total Replies</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {fmtNum(responseTimes.totalReplies)}
                  </p>
                </div>
              </div>
              {responseTimes.distribution && responseTimes.distribution.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2">Distribution</p>
                  <div className="space-y-1.5">
                    {responseTimes.distribution.map((bucket, idx) => {
                      const maxCount = Math.max(...responseTimes.distribution.map((d) => d.count || 0), 1);
                      const widthPct = ((bucket.count || 0) / maxCount) * 100;
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-14 text-right flex-shrink-0">
                            {bucket.label || bucket.range || `${bucket.from}-${bucket.to}h`}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(widthPct, 2)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 w-8 tabular-nums">{bucket.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
