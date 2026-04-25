import { useState, useEffect, useCallback } from 'react';
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Loader2,
  AlertTriangle,
  Zap,
  DollarSign,
  Activity,
  TrendingUp,
  Settings2,
  Save,
  ChevronDown,
  ChevronRight,
  Shield,
  RefreshCw,
  Bot,
  MessageSquare,
  CheckCircle,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const PIE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'];

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google_gemini: 'Google Gemini',
};

// ── Helpers ──────────────────────────────────────────────────────────

const fmtNum = (n) => {
  if (n == null) return '--';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Number(n).toLocaleString();
};

const fmtCost = (n) => {
  if (n == null) return '--';
  return `$${Number(n).toFixed(2)}`;
};

function UsageTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/60 p-3 text-xs">
      <p className="font-medium text-gray-800 mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600">{entry.dataKey === 'inputTokens' ? 'Input' : entry.dataKey === 'outputTokens' ? 'Output' : entry.dataKey}:</span>
          <span className="font-semibold text-gray-900">
            {entry.dataKey === 'cost' ? fmtCost(entry.value) : fmtNum(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function AIUsage() {
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [summary, setSummary] = useState(null);
  const [limitsData, setLimitsData] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [toast, setToast] = useState(null);

  // Settings panel
  const [showConfig, setShowConfig] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [limitsForm, setLimitsForm] = useState({ monthlyTokenLimit: 5000000, monthlyCostLimit: 50, alertAtPercent: 80 });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Fetch ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, limitsRes, pricingRes] = await Promise.all([
        api.get(`/ai/usage/summary?period=${period}`),
        api.get('/ai/usage/limits'),
        api.get('/ai/usage/pricing'),
      ]);

      setSummary(summaryRes.data || {});

      const ld = limitsRes.data || {};
      setLimitsData(ld);
      if (ld.limits) {
        setLimitsForm({
          monthlyTokenLimit: ld.limits.monthlyTokenLimit || 5000000,
          monthlyCostLimit: ld.limits.monthlyCostLimit || 50,
          alertAtPercent: ld.limits.alertAtPercent || 80,
        });
      }

      setPricing(pricingRes.data || {});
    } catch (err) {
      setError(err.message || 'Failed to load usage data.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Save limits ───────────────────────────────────────────────────

  const handleSaveLimits = async () => {
    setSavingLimits(true);
    try {
      await api.put('/ai/usage/limits', limitsForm);
      setToast({ type: 'success', message: 'Usage limits updated.' });
      const res = await api.get('/ai/usage/limits');
      setLimitsData(res.data || {});
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save limits.' });
    } finally {
      setSavingLimits(false);
    }
  };

  // ── Save pricing ──────────────────────────────────────────────────

  const handleSavePricing = async () => {
    setSavingPricing(true);
    try {
      await api.put('/ai/usage/pricing', pricing);
      setToast({ type: 'success', message: 'Pricing config updated.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save pricing.' });
    } finally {
      setSavingPricing(false);
    }
  };

  const updatePricing = (provider, model, field, value) => {
    setPricing((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [model]: {
          ...prev[provider]?.[model],
          [field]: parseFloat(value) || 0,
        },
      },
    }));
  };

  // ── Guards ────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Admin access required.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading usage data...</p>
        </div>
      </div>
    );
  }

  const totals = summary?.totals || {};
  const daily = summary?.daily || [];
  const byProvider = summary?.byProvider || [];
  const byModel = summary?.byModel || [];
  const bySource = summary?.bySource || {};
  const limits = limitsData?.limits || {};
  const currentUsage = limitsData?.currentUsage || {};

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">API Usage & Cost</h1>
          <p className="text-sm text-gray-500 mt-1">Track token consumption, estimated costs, and manage limits across all AI providers.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setPeriod(preset.label)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === preset.label
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="btn-secondary btn-sm flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-secondary btn-sm flex items-center gap-1.5"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 p-4 rounded-xl text-sm border ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-auto">&times;</button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
          <button onClick={() => { setError(null); fetchData(); }} className="ml-auto text-red-500 hover:text-red-700">Retry</button>
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Tokens"
          value={fmtNum(totals.totalTokens)}
          sub={`${fmtNum(totals.inputTokens)} in / ${fmtNum(totals.outputTokens)} out`}
          icon={Zap}
          gradient="from-blue-500 to-blue-600"
          bgLight="bg-blue-50"
          textColor="text-blue-600"
        />
        <KpiCard
          label="Estimated Cost"
          value={fmtCost(totals.estimatedCost)}
          sub={`${period} period`}
          icon={DollarSign}
          gradient="from-emerald-500 to-emerald-600"
          bgLight="bg-emerald-50"
          textColor="text-emerald-600"
        />
        <KpiCard
          label="Total Requests"
          value={fmtNum(totals.requestCount)}
          sub={`${fmtNum(bySource.agent?.requestCount)} agent / ${fmtNum(bySource.chat?.requestCount)} chat`}
          icon={Activity}
          gradient="from-purple-500 to-purple-600"
          bgLight="bg-purple-50"
          textColor="text-purple-600"
        />
        <KpiCard
          label="Avg Cost / Request"
          value={totals.requestCount > 0 ? fmtCost(totals.estimatedCost / totals.requestCount) : '$0.00'}
          sub={`${totals.requestCount > 0 ? fmtNum(Math.round(totals.totalTokens / totals.requestCount)) : 0} tokens avg`}
          icon={TrendingUp}
          gradient="from-amber-500 to-amber-600"
          bgLight="bg-amber-50"
          textColor="text-amber-600"
        />
      </div>

      {/* ── Usage Limits Progress ────────────────────────────────── */}
      {limits.monthlyTokenLimit > 0 && (
        <div className="card">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Monthly Limits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LimitBar
              label="Token Usage"
              current={currentUsage.tokens || 0}
              limit={limits.monthlyTokenLimit}
              percent={currentUsage.percentTokens || 0}
              formatValue={fmtNum}
              alertAt={limits.alertAtPercent}
            />
            <LimitBar
              label="Cost"
              current={currentUsage.cost || 0}
              limit={limits.monthlyCostLimit}
              percent={currentUsage.percentCost || 0}
              formatValue={fmtCost}
              alertAt={limits.alertAtPercent}
            />
          </div>
        </div>
      )}

      {/* ── Usage Over Time Chart ────────────────────────────────── */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Usage Over Time</h2>
        {daily.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Activity className="w-10 h-10 mb-3" />
            <p className="text-sm">No usage data for this period.</p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => {
                    try { return format(new Date(d), 'MMM d'); } catch { return d; }
                  }}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => fmtNum(v)}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<UsageTooltip />} />
                <Area type="monotone" dataKey="inputTokens" stroke="#2563eb" strokeWidth={2} fill="url(#gradInput)" />
                <Area type="monotone" dataKey="outputTokens" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradOutput)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {daily.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-1 rounded-full bg-blue-500" /> Input Tokens
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-1 rounded-full bg-purple-500" /> Output Tokens
            </span>
          </div>
        )}
      </div>

      {/* ── Cost Breakdown ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table */}
        <div className="lg:col-span-2 card">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Cost by Model</h2>
          {byModel.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">Provider</th>
                    <th className="table-header text-left">Model</th>
                    <th className="table-header text-right">Requests</th>
                    <th className="table-header text-right">Input Tokens</th>
                    <th className="table-header text-right">Output Tokens</th>
                    <th className="table-header text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-brand-50/30/50 transition-colors">
                      <td className="table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: PIE_COLORS[Object.keys(PROVIDER_LABELS).indexOf(row.provider) % PIE_COLORS.length] }}
                          />
                          {PROVIDER_LABELS[row.provider] || row.provider}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-xs">{row.model}</td>
                      <td className="table-cell text-right tabular-nums">{row.requestCount?.toLocaleString()}</td>
                      <td className="table-cell text-right tabular-nums">{fmtNum(row.inputTokens)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtNum(row.outputTokens)}</td>
                      <td className="table-cell text-right tabular-nums font-medium">{fmtCost(row.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                {byModel.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 font-semibold">
                      <td className="table-cell" colSpan={2}>Total</td>
                      <td className="table-cell text-right tabular-nums">{totals.requestCount?.toLocaleString()}</td>
                      <td className="table-cell text-right tabular-nums">{fmtNum(totals.inputTokens)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtNum(totals.outputTokens)}</td>
                      <td className="table-cell text-right tabular-nums">{fmtCost(totals.estimatedCost)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Pie Chart */}
        <div className="card">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Cost by Provider</h2>
          {byProvider.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byProvider.map((p) => ({ name: PROVIDER_LABELS[p.provider] || p.provider, value: p.cost }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {byProvider.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => fmtCost(value)}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Source breakdown */}
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">By Source</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-gray-600">
                <Bot className="w-3.5 h-3.5" /> Agent Checks
              </span>
              <span className="font-medium text-gray-800">{fmtCost(bySource.agent?.cost)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-gray-600">
                <MessageSquare className="w-3.5 h-3.5" /> Chat
              </span>
              <span className="font-medium text-gray-800">{fmtCost(bySource.chat?.cost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Config Panel (collapsible) ───────────────────────────── */}
      {showConfig && (
        <div className="space-y-6">
          {/* Limits config */}
          <div className="card">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Usage Limits</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Token Limit</label>
                <input
                  type="number"
                  value={limitsForm.monthlyTokenLimit}
                  onChange={(e) => setLimitsForm(p => ({ ...p, monthlyTokenLimit: parseInt(e.target.value, 10) || 0 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Cost Limit ($)</label>
                <input
                  type="number"
                  value={limitsForm.monthlyCostLimit}
                  onChange={(e) => setLimitsForm(p => ({ ...p, monthlyCostLimit: parseFloat(e.target.value) || 0 }))}
                  step="0.01"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Alert at (%)</label>
                <input
                  type="number"
                  value={limitsForm.alertAtPercent}
                  onChange={(e) => setLimitsForm(p => ({ ...p, alertAtPercent: parseFloat(e.target.value) || 80 }))}
                  min={0}
                  max={100}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={handleSaveLimits} disabled={savingLimits} className="btn-primary flex items-center gap-2">
                {savingLimits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingLimits ? 'Saving...' : 'Save Limits'}
              </button>
            </div>
          </div>

          {/* Pricing config */}
          <div className="card">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Pricing Configuration</h2>
            <p className="text-xs text-gray-500 mb-4">Set per-million-token rates for each model to calculate estimated costs.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">Provider</th>
                    <th className="table-header text-left">Model</th>
                    <th className="table-header text-right">Input $/1M tokens</th>
                    <th className="table-header text-right">Output $/1M tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing && Object.entries(pricing).map(([provider, models]) =>
                    Object.entries(models).map(([model, rates], i) => (
                      <tr key={`${provider}-${model}`} className="border-t border-gray-100">
                        <td className="table-cell">{i === 0 ? (PROVIDER_LABELS[provider] || provider) : ''}</td>
                        <td className="table-cell font-mono text-xs">{model}</td>
                        <td className="table-cell text-right">
                          <input
                            type="number"
                            value={rates.inputPer1M}
                            onChange={(e) => updatePricing(provider, model, 'inputPer1M', e.target.value)}
                            step="0.01"
                            className="input-field !w-24 !py-1 !text-xs text-right ml-auto"
                          />
                        </td>
                        <td className="table-cell text-right">
                          <input
                            type="number"
                            value={rates.outputPer1M}
                            onChange={(e) => updatePricing(provider, model, 'outputPer1M', e.target.value)}
                            step="0.01"
                            className="input-field !w-24 !py-1 !text-xs text-right ml-auto"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={handleSavePricing} disabled={savingPricing} className="btn-primary flex items-center gap-2">
                {savingPricing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingPricing ? 'Saving...' : 'Save Pricing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, gradient, bgLight, textColor }) {
  return (
    <div className="card relative overflow-hidden group hover:shadow-md transition-shadow">
      {/* Gradient accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient} opacity-80`} />

      <div className="flex items-start justify-between pt-1">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl ${bgLight} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${textColor}`} />
        </div>
      </div>
    </div>
  );
}

// ── Limit Progress Bar ──────────────────────────────────────────────

function LimitBar({ label, current, limit, percent, formatValue, alertAt }) {
  const barColor =
    percent >= alertAt ? 'bg-red-500'
    : percent >= alertAt * 0.75 ? 'bg-amber-500'
    : 'bg-emerald-500';

  const bgColor =
    percent >= alertAt ? 'bg-red-100'
    : percent >= alertAt * 0.75 ? 'bg-amber-100'
    : 'bg-emerald-100';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-500">
          {formatValue(current)} / {formatValue(limit)}
        </span>
      </div>
      <div className={`w-full h-2.5 ${bgColor} rounded-full overflow-hidden`}>
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-gray-400">{percent.toFixed(1)}% used</span>
        {percent >= alertAt && (
          <span className="text-[10px] text-red-500 font-medium flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" /> Over threshold
          </span>
        )}
      </div>
    </div>
  );
}
