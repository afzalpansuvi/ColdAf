import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import {
  Loader2,
  AlertTriangle,
  Play,
  Save,
  ChevronDown,
  ChevronRight,
  Shield,
  Brain,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Settings2,
  RefreshCw,
  BarChart3,
  Plus,
  Trash2,
  Mail,
  Phone,
  Crown,
  Pencil,
  ToggleLeft,
  ToggleRight,
  X,
  Bot,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Every 1 hour' },
  { value: 2, label: 'Every 2 hours' },
  { value: 3, label: 'Every 3 hours' },
  { value: 6, label: 'Every 6 hours' },
];

const STATUS_CONFIG = {
  healthy: { color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-100', label: 'Healthy' },
  issues_found: { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Issues Found' },
  action_taken: { color: 'bg-red-500', textColor: 'text-red-700', bgColor: 'bg-red-100', label: 'Action Taken' },
  error: { color: 'bg-red-500', textColor: 'text-red-700', bgColor: 'bg-red-100', label: 'Error' },
  idle: { color: 'bg-gray-400', textColor: 'text-gray-600', bgColor: 'bg-gray-100', label: 'Idle' },
};

const AGENT_ICONS = {
  ceo: Crown,
  'cold-email': Mail,
  'cold-calling': Phone,
};

const AGENT_COLORS = {
  ceo: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200', ring: 'ring-purple-300' },
  'cold-email': { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200', ring: 'ring-blue-300' },
  'cold-calling': { bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200', ring: 'ring-orange-300' },
};

const DEFAULT_AGENT_COLOR = { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', ring: 'ring-gray-300' };

function CheckStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {config.label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function AIAgent() {
  const { isAdmin } = useAuth();

  // Data
  const [status, setStatus] = useState(null);
  const [agents, setAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Settings
  const [settings, setSettings] = useState({
    enabled: false,
    intervalHours: 2,
    bounceThreshold: 5,
    spamThreshold: 1,
    queueBacklogLimit: 500,
    canAutoPause: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // UI state
  const [triggering, setTriggering] = useState(null); // agent slug or 'all'
  const [toast, setToast] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [selectedAgent, setSelectedAgent] = useState(null); // agent object for detail view
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Fetch data ────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, agentsRes, logsRes] = await Promise.all([
        api.get('/ai/agent/status'),
        api.get('/ai/agent/agents'),
        api.get('/ai/agent/logs?limit=20'),
      ]);

      const statusData = statusRes.data || {};
      setStatus(statusData);
      setSettings({
        enabled: statusData.enabled || false,
        intervalHours: statusData.intervalMinutes ? Math.round(statusData.intervalMinutes / 60) : 2,
        bounceThreshold: statusData.bounceThreshold || 5,
        spamThreshold: statusData.spamThreshold || 1,
        queueBacklogLimit: statusData.queueBacklogLimit || 500,
        canAutoPause: statusData.autoPauseEnabled !== false,
      });

      setAgents(agentsRes.data?.agents || []);
      setLogs(logsRes.data?.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to load AI Agent data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Settings handlers ─────────────────────────────────────────────

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/ai/agent/settings', {
        enabled: settings.enabled,
        intervalMinutes: settings.intervalHours * 60,
        bounceThreshold: settings.bounceThreshold,
        spamThreshold: settings.spamThreshold,
        queueBacklogLimit: settings.queueBacklogLimit,
        autoPause: settings.canAutoPause,
      });
      setToast({ type: 'success', message: 'AI Agent settings saved.' });
      const res = await api.get('/ai/agent/status');
      setStatus(res.data || {});
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleEnabled = async () => {
    const newEnabled = !settings.enabled;
    updateSetting('enabled', newEnabled);
    try {
      await api.put('/ai/agent/settings', { enabled: newEnabled });
      setToast({ type: 'success', message: newEnabled ? 'AI Agents enabled.' : 'AI Agents disabled.' });
      const res = await api.get('/ai/agent/status');
      setStatus(res.data || {});
    } catch (err) {
      updateSetting('enabled', !newEnabled);
      setToast({ type: 'error', message: err.message || 'Failed to toggle agent.' });
    }
  };

  // ── Trigger ───────────────────────────────────────────────────────

  const handleTrigger = async (slug = null) => {
    setTriggering(slug || 'all');
    try {
      const body = slug ? { slug } : {};
      const res = await api.post('/ai/agent/trigger', body);
      const newLog = res.data?.log;
      if (newLog) {
        setLogs((prev) => [newLog, ...prev].slice(0, 20));
      }
      setToast({ type: 'success', message: slug ? `${slug} check completed.` : 'Full check completed.' });
      // Refresh agents to get updated lastLog
      const agentsRes = await api.get('/ai/agent/agents');
      setAgents(agentsRes.data?.agents || []);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Health check failed.' });
    } finally {
      setTriggering(null);
    }
  };

  // ── Agent toggle ──────────────────────────────────────────────────

  const handleToggleAgent = async (agent) => {
    try {
      await api.put(`/ai/agent/agents/${agent.slug}`, { isEnabled: !agent.isEnabled });
      setAgents((prev) =>
        prev.map((a) => a.slug === agent.slug ? { ...a, isEnabled: !a.isEnabled } : a)
      );
      setToast({ type: 'success', message: `${agent.name} ${agent.isEnabled ? 'disabled' : 'enabled'}.` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to toggle agent.' });
    }
  };

  // ── Delete agent ──────────────────────────────────────────────────

  const handleDeleteAgent = async (agent) => {
    if (!window.confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/ai/agent/agents/${agent.slug}`);
      setAgents((prev) => prev.filter((a) => a.slug !== agent.slug));
      setSelectedAgent(null);
      setToast({ type: 'success', message: `Agent "${agent.name}" deleted.` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to delete agent.' });
    }
  };

  // ── Log toggle ────────────────────────────────────────────────────

  const toggleLog = (logId) => {
    setExpandedLogs((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  // ── Admin guard ──────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Admin access required to manage AI Agents.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading AI Agents...</p>
        </div>
      </div>
    );
  }

  // Separate CEO from specialists
  const ceoAgent = agents.find((a) => a.slug === 'ceo');
  const specialistAgents = agents.filter((a) => a.slug !== 'ceo');

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">AI Agents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Multi-agent system for monitoring campaigns, email outreach, and phone calls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            className="btn-secondary flex items-center gap-2"
          >
            <Settings2 className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Agent
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 p-4 rounded-xl text-sm border ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          {toast.message}
          <button onClick={() => setToast(null)} className={`ml-auto ${toast.type === 'success' ? 'text-green-500 hover:text-green-700' : 'text-red-500 hover:text-red-700'}`}>
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
          <button onClick={() => { setError(null); fetchData(); }} className="ml-auto text-red-500 hover:text-red-700">Retry</button>
        </div>
      )}

      {/* ── Global Status Bar ────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${settings.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Brain className={`w-6 h-6 ${settings.enabled ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">
                  Agent System {settings.enabled ? 'Active' : 'Disabled'}
                </h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  settings.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${settings.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  {agents.filter(a => a.isEnabled).length} agent{agents.filter(a => a.isEnabled).length !== 1 ? 's' : ''} active
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {status?.lastCheck
                  ? `Last check: ${format(new Date(status.lastCheck), 'MMM d, HH:mm')}`
                  : 'No checks run yet'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTrigger()}
              disabled={triggering === 'all'}
              className="btn-primary flex items-center gap-2"
            >
              {triggering === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {triggering === 'all' ? 'Running...' : 'Run All Checks'}
            </button>
            <button
              onClick={handleToggleEnabled}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                settings.enabled
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {settings.enabled ? <><XCircle className="w-4 h-4" /> Disable</> : <><CheckCircle className="w-4 h-4" /> Enable</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Settings Panel (collapsible) ─────────────────────────── */}
      {showSettingsPanel && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Settings2 className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">Global Settings</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-3.5 h-3.5 inline mr-1" />Check Interval
              </label>
              <div className="relative">
                <select value={settings.intervalHours} onChange={(e) => updateSetting('intervalHours', parseInt(e.target.value, 10))} className="select-field !pr-8">
                  {INTERVAL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bounce Threshold (%)</label>
              <input type="number" value={settings.bounceThreshold} onChange={(e) => updateSetting('bounceThreshold', parseFloat(e.target.value) || 0)} min={0} max={100} step={0.5} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Spam Threshold (%)</label>
              <input type="number" value={settings.spamThreshold} onChange={(e) => updateSetting('spamThreshold', parseFloat(e.target.value) || 0)} min={0} max={100} step={0.1} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Queue Backlog Limit</label>
              <input type="number" value={settings.queueBacklogLimit} onChange={(e) => updateSetting('queueBacklogLimit', parseInt(e.target.value, 10) || 0)} min={0} max={100000} className="input-field" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative inline-flex items-center">
                <input type="checkbox" checked={settings.canAutoPause} onChange={(e) => updateSetting('canAutoPause', e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600" />
              </div>
              <span className="text-sm text-gray-700">Auto-Pause Campaigns</span>
            </label>
            <button onClick={handleSaveSettings} disabled={savingSettings} className="btn-primary flex items-center gap-2">
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── Agent Cards Grid ─────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* CEO Agent Card */}
          {ceoAgent && (
            <AgentCard
              agent={ceoAgent}
              isCeo
              onTrigger={() => handleTrigger('ceo')}
              onToggle={() => handleToggleAgent(ceoAgent)}
              onSelect={() => setSelectedAgent(selectedAgent?.slug === 'ceo' ? null : ceoAgent)}
              isSelected={selectedAgent?.slug === 'ceo'}
              isTriggering={triggering === 'ceo'}
            />
          )}

          {/* Specialist Cards */}
          {specialistAgents.map((agent) => (
            <AgentCard
              key={agent.slug}
              agent={agent}
              onTrigger={() => handleTrigger(agent.slug)}
              onToggle={() => handleToggleAgent(agent)}
              onSelect={() => setSelectedAgent(selectedAgent?.slug === agent.slug ? null : agent)}
              onDelete={() => handleDeleteAgent(agent)}
              isSelected={selectedAgent?.slug === agent.slug}
              isTriggering={triggering === agent.slug}
            />
          ))}
        </div>
      </div>

      {/* ── Selected Agent Detail ────────────────────────────────── */}
      {selectedAgent && (
        <AgentDetail
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onUpdated={(updated) => {
            setAgents(prev => prev.map(a => a.slug === updated.slug ? { ...a, ...updated } : a));
            setSelectedAgent(updated);
            setToast({ type: 'success', message: `${updated.name} settings saved.` });
          }}
        />
      )}

      {/* ── Activity Log ─────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">Activity Log</h2>
          </div>
          <button onClick={fetchData} className="btn-secondary btn-sm flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <BarChart3 className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1">Run a health check to see the first log entry.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {logs.map((log) => {
              const logId = log.id || log._id;
              const isExpanded = expandedLogs[logId];

              return (
                <div key={logId} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleLog(logId)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50/30 transition-colors text-left"
                  >
                    <div className="text-gray-400">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <span className="text-xs tabular-nums text-gray-500 whitespace-nowrap">
                        {log.createdAt ? format(new Date(log.createdAt), 'MMM d, HH:mm:ss') : '--'}
                      </span>
                      {log.agentName && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {log.agentName}
                        </span>
                      )}
                      <CheckStatusBadge status={log.status} />
                      <span className="text-sm text-gray-700 truncate">{log.summary || 'No summary.'}</span>
                    </div>
                    {log.tokenUsage != null && typeof log.tokenUsage === 'object' && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-1 flex-shrink-0">
                        <Zap className="w-3 h-3" />
                        {((log.tokenUsage.input_tokens || 0) + (log.tokenUsage.output_tokens || 0)).toLocaleString()} tokens
                      </span>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                      <div className="ml-7 space-y-3 mt-3">
                        {log.summary && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Summary</p>
                            <p className="text-sm text-gray-700">{log.summary}</p>
                          </div>
                        )}
                        {log.metricsSnapshot && Object.keys(log.metricsSnapshot).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Metrics</p>
                            <pre className="text-xs bg-gray-50 p-3 rounded-lg border overflow-x-auto max-h-40">
                              {JSON.stringify(log.metricsSnapshot, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.actionsTaken && log.actionsTaken.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Actions</p>
                            <div className="space-y-1.5">
                              {log.actionsTaken.map((action, idx) => (
                                <div key={idx} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <span className="text-sm text-amber-800">
                                    {typeof action === 'string' ? action : action.reason || action.type || JSON.stringify(action)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Agent Modal ───────────────────────────────────── */}
      {showCreateModal && (
        <CreateAgentModal
          agents={agents}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newAgent) => {
            setAgents((prev) => [...prev, newAgent]);
            setShowCreateModal(false);
            setToast({ type: 'success', message: `Agent "${newAgent.name}" created.` });
          }}
        />
      )}
    </div>
  );
}

// ── Agent Card Component ────────────────────────────────────────────

function AgentCard({ agent, isCeo, onTrigger, onToggle, onSelect, onDelete, isSelected, isTriggering }) {
  const colors = AGENT_COLORS[agent.slug] || DEFAULT_AGENT_COLOR;
  const Icon = AGENT_ICONS[agent.slug] || Bot;

  return (
    <div
      className={`card cursor-pointer transition-all border-2 ${
        isSelected ? `${colors.border} ring-2 ${colors.ring}` : 'border-transparent hover:border-gray-200'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.bg}`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-800">{agent.name}</h3>
              {isCeo && (
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">CEO</span>
              )}
              {agent.isBuiltin && !isCeo && (
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">Built-in</span>
              )}
            </div>
            <p className="text-xs text-gray-500">{agent.specialty || agent.description || 'No description'}</p>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          title={agent.isEnabled ? 'Disable agent' : 'Enable agent'}
        >
          {agent.isEnabled ? (
            <ToggleRight className="w-5 h-5 text-green-500" />
          ) : (
            <ToggleLeft className="w-5 h-5 text-gray-400" />
          )}
        </button>
      </div>

      {/* Status row */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckStatusBadge status={agent.lastLog?.status || 'idle'} />
          {agent.lastCheckAt && (
            <span className="text-[10px] text-gray-400">
              {format(new Date(agent.lastCheckAt), 'MMM d, HH:mm')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onTrigger}
            disabled={isTriggering || !agent.isEnabled}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
            title="Run check"
          >
            {isTriggering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
            ) : (
              <Play className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>
          {!agent.isBuiltin && onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
              title="Delete agent"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Model badge + last summary */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {agent.model && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">
            {agent.model}
          </span>
        )}
        {agent.config?.temperature !== undefined && (
          <span className="text-[10px] text-gray-400">temp {Number(agent.config.temperature).toFixed(2)}</span>
        )}
      </div>
      {agent.lastLog?.summary && (
        <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{agent.lastLog.summary}</p>
      )}
    </div>
  );
}

// ── Model catalogue ────────────────────────────────────────────────
const MODEL_OPTIONS = [
  { group: 'Anthropic (Claude)',  options: [
    { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5  — Fast & cheap' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — Balanced' },
    { value: 'claude-opus-4-6',   label: 'Claude Opus 4.6  — Most capable' },
  ]},
  { group: 'OpenAI (GPT)', options: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini — Fast & cheap' },
    { value: 'gpt-4o',      label: 'GPT-4o      — Balanced' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo — High quality' },
  ]},
  { group: 'Google (Gemini)', options: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Fast' },
    { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro   — Capable' },
  ]},
];

// ── Agent Detail Panel ──────────────────────────────────────────────

function AgentDetail({ agent: initialAgent, onClose, onUpdated }) {
  const [agent, setAgent] = useState(initialAgent);
  const [agentLogs, setAgentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'logs'

  // Editable form state
  const [form, setForm] = useState({
    model: initialAgent.model || 'claude-haiku-4-5',
    checkIntervalMinutes: initialAgent.checkIntervalMinutes || 120,
    systemPrompt: initialAgent.systemPrompt || '',
    description: initialAgent.description || '',
    temperature: initialAgent.config?.temperature ?? 0.7,
    maxTokens: initialAgent.config?.maxTokens || 1024,
    bounceThreshold: initialAgent.config?.bounceThreshold ?? '',
    spamThreshold: initialAgent.config?.spamThreshold ?? '',
    stopOnError: initialAgent.config?.stopOnError ?? false,
    verboseLogging: initialAgent.config?.verboseLogging ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    setLoadingLogs(true);
    api.get(`/ai/agent/agents/${agent.slug}`)
      .then((res) => {
        const data = res.data?.agent || res.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setAgent(prev => ({ ...prev, ...data }));
          setForm(f => ({
            ...f,
            model: data.model || f.model,
            checkIntervalMinutes: data.checkIntervalMinutes || f.checkIntervalMinutes,
            systemPrompt: data.systemPrompt || f.systemPrompt,
            description: data.description || f.description,
            temperature: data.config?.temperature ?? f.temperature,
            maxTokens: data.config?.maxTokens || f.maxTokens,
            bounceThreshold: data.config?.bounceThreshold ?? f.bounceThreshold,
            spamThreshold: data.config?.spamThreshold ?? f.spamThreshold,
            stopOnError: data.config?.stopOnError ?? f.stopOnError,
            verboseLogging: data.config?.verboseLogging ?? f.verboseLogging,
          }));
        }
        setAgentLogs(res.data?.logs || []);
      })
      .catch(() => setAgentLogs([]))
      .finally(() => setLoadingLogs(false));
  }, [agent.slug]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.put(`/ai/agent/agents/${agent.slug}`, {
        model: form.model,
        checkIntervalMinutes: Number(form.checkIntervalMinutes),
        systemPrompt: form.systemPrompt,
        description: form.description,
        config: {
          temperature: Number(form.temperature),
          maxTokens: Number(form.maxTokens),
          ...(form.bounceThreshold !== '' ? { bounceThreshold: Number(form.bounceThreshold) } : {}),
          ...(form.spamThreshold !== '' ? { spamThreshold: Number(form.spamThreshold) } : {}),
          stopOnError: form.stopOnError,
          verboseLogging: form.verboseLogging,
        },
      });
      const updated = { ...agent, ...form, config: { temperature: form.temperature, maxTokens: form.maxTokens } };
      setAgent(updated);
      onUpdated?.(updated);
      setSaveMsg({ type: 'success', text: 'Settings saved.' });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.message || 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: 'settings', label: 'Settings' },
    { id: 'logs',     label: 'Recent Logs' },
  ];

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">{agent.name}</h2>
          <CheckStatusBadge status={agent.lastLog?.status || 'idle'} />
          {agent.isBuiltin && (
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">Built-in</span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5 -mx-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Settings tab ─── */}
      {activeTab === 'settings' && (
        <div className="space-y-5">
          {/* Read-only meta */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4 border-b border-gray-100">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Specialty</p>
              <p className="text-sm font-medium text-gray-800">{agent.specialty || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Parent Agent</p>
              <p className="text-sm font-medium text-gray-800">{agent.parentName || 'None (Top-level)'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Last Check</p>
              <p className="text-sm font-medium text-gray-800">
                {agent.lastCheckAt ? format(new Date(agent.lastCheckAt), 'MMM d, HH:mm') : 'Never'}
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              className="input-field text-sm"
              placeholder="What does this agent do?"
            />
          </div>

          {/* Model + Interval */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Model
                <span className="ml-1.5 text-[10px] font-normal text-gray-400">Uses your BYOK key for this provider</span>
              </label>
              <select
                value={form.model}
                onChange={e => setField('model', e.target.value)}
                className="select-field text-sm"
              >
                {MODEL_OPTIONS.map(grp => (
                  <optgroup key={grp.group} label={grp.group}>
                    {grp.options.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Check Interval
                <span className="ml-1.5 text-[10px] font-normal text-gray-400">minutes between auto-checks</span>
              </label>
              <div className="relative">
                <select
                  value={form.checkIntervalMinutes}
                  onChange={e => setField('checkIntervalMinutes', parseInt(e.target.value, 10))}
                  className="select-field text-sm !pr-8"
                >
                  {[30, 60, 120, 180, 360, 720, 1440].map(m => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : m < 1440 ? `${m / 60} hr` : '24 hr'}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Generation settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature
                <span className="ml-1.5 text-[10px] font-normal text-gray-400">0 = deterministic · 1 = creative</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0" max="1" step="0.05"
                  value={form.temperature}
                  onChange={e => setField('temperature', parseFloat(e.target.value))}
                  className="flex-1 accent-brand-600"
                />
                <span className="w-10 text-right text-sm font-mono text-gray-700">{Number(form.temperature).toFixed(2)}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
              <input
                type="number"
                value={form.maxTokens}
                onChange={e => setField('maxTokens', parseInt(e.target.value, 10) || 1024)}
                min={256} max={32000} step={256}
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Agent-specific thresholds (only for specialist agents) */}
          {agent.slug !== 'ceo' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bounce Threshold Override (%)
                  <span className="ml-1.5 text-[10px] font-normal text-gray-400">leave blank to use global</span>
                </label>
                <input
                  type="number"
                  value={form.bounceThreshold}
                  onChange={e => setField('bounceThreshold', e.target.value)}
                  min={0} max={100} step={0.5}
                  placeholder="e.g. 5"
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Spam Threshold Override (%)
                  <span className="ml-1.5 text-[10px] font-normal text-gray-400">leave blank to use global</span>
                </label>
                <input
                  type="number"
                  value={form.spamThreshold}
                  onChange={e => setField('spamThreshold', e.target.value)}
                  min={0} max={100} step={0.1}
                  placeholder="e.g. 0.3"
                  className="input-field text-sm"
                />
              </div>
            </div>
          )}

          {/* Toggles */}
          <div className="flex items-center gap-6 pt-1 border-t border-gray-100">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className="relative inline-flex items-center">
                <input type="checkbox" checked={form.stopOnError} onChange={e => setField('stopOnError', e.target.checked)} className="sr-only peer" />
                <div className="w-8 h-4 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600" />
              </div>
              <span className="text-sm text-gray-700">Stop on first error</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className="relative inline-flex items-center">
                <input type="checkbox" checked={form.verboseLogging} onChange={e => setField('verboseLogging', e.target.checked)} className="sr-only peer" />
                <div className="w-8 h-4 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600" />
              </div>
              <span className="text-sm text-gray-700">Verbose logging</span>
            </label>
          </div>

          {/* System prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Prompt
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">custom instructions for this agent's personality / focus</span>
            </label>
            <textarea
              value={form.systemPrompt}
              onChange={e => setField('systemPrompt', e.target.value)}
              rows={5}
              placeholder="You are a specialized outbound email monitoring agent. Your job is to..."
              className="input-field text-sm resize-none font-mono"
            />
          </div>

          {/* Save */}
          {saveMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
              saveMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {saveMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {saveMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Logs tab ─── */}
      {activeTab === 'logs' && (
        <div>
          {loadingLogs ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : agentLogs.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">No logs yet for this agent. Run a check to see activity.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {agentLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 bg-gray-50 rounded-lg text-xs">
                  <span className="text-gray-400 tabular-nums whitespace-nowrap mt-0.5">
                    {log.createdAt ? format(new Date(log.createdAt), 'MMM d, HH:mm') : '--'}
                  </span>
                  <CheckStatusBadge status={log.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate">{log.summary || '--'}</p>
                    {log.model && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{log.model} · {(log.tokenUsage?.input_tokens || 0) + (log.tokenUsage?.output_tokens || 0)} tokens</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Agent Modal ──────────────────────────────────────────────

function CreateAgentModal({ agents, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    specialty: '',
    description: '',
    systemPrompt: '',
    model: 'claude-haiku-4-5',
    parentAgentId: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleNameChange = (name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm((prev) => ({ ...prev, name, slug }));
  };

  const handleCreate = async () => {
    if (!form.name || !form.slug) {
      setError('Name and slug are required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await api.post('/ai/agent/agents', {
        ...form,
        parentAgentId: form.parentAgentId || null,
      });
      onCreated(res.data?.agent || { ...form, id: 'new' });
    } catch (err) {
      setError(err.message || 'Failed to create agent.');
    } finally {
      setCreating(false);
    }
  };

  const parentOptions = agents.filter((a) => !a.parentAgentId); // Only top-level agents can be parents

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Create New Agent</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. LinkedIn Outreach Specialist"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="e.g. linkedin-outreach"
              className="input-field font-mono text-sm"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Lowercase alphanumeric with hyphens only.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
              <input
                type="text"
                value={form.specialty}
                onChange={(e) => setForm((prev) => ({ ...prev, specialty: e.target.value }))}
                placeholder="e.g. LinkedIn"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Agent</label>
              <div className="relative">
                <select
                  value={form.parentAgentId}
                  onChange={(e) => setForm((prev) => ({ ...prev, parentAgentId: e.target.value }))}
                  className="select-field"
                >
                  <option value="">None</option>
                  {parentOptions.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="What does this agent do?"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI Model</label>
            <select
              value={form.model}
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
              className="select-field"
            >
              <option value="claude-haiku-4-5">Claude Haiku 4.5 (Fast)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              rows={5}
              placeholder="Instructions for this agent..."
              className="input-field resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} disabled={creating} className="btn-primary flex items-center gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
