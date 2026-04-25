import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import {
  Loader2,
  AlertTriangle,
  Save,
  Mail,
  Shield,
  Brain,
  Bell,
  Globe,
  Clock,
  CheckCircle,
  ChevronDown,
  Settings2,
  Flame,
  BarChart3,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AI_MODEL_GROUPS = [
  {
    label: 'Anthropic Claude',
    models: [
      { value: 'claude-haiku-3-5', label: 'Claude 3.5 Haiku' },
      { value: 'claude-sonnet-4-5-20250514', label: 'Claude 4.5 Sonnet' },
    ],
  },
  {
    label: 'OpenAI',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  {
    label: 'Google Gemini',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
];

const CHECK_INTERVALS = [
  { value: '1h', label: 'Every 1 hour' },
  { value: '2h', label: 'Every 2 hours' },
  { value: '3h', label: 'Every 3 hours' },
  { value: '6h', label: 'Every 6 hours' },
];

const NOTIFICATION_EVENTS = [
  { key: 'reply_received', label: 'Reply received', description: 'When a lead replies to an outreach email' },
  { key: 'campaign_paused', label: 'Campaign paused', description: 'When a campaign is automatically paused' },
  { key: 'smtp_degraded', label: 'SMTP degraded', description: 'When an SMTP account health degrades' },
  { key: 'smtp_failed', label: 'SMTP failed', description: 'When an SMTP account fails health check' },
  { key: 'bounce_threshold', label: 'Bounce threshold', description: 'When bounce rate exceeds threshold' },
  { key: 'spam_threshold', label: 'Spam threshold', description: 'When spam complaint rate exceeds threshold' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'UTC',
];

const DEFAULT_SETTINGS = {
  // Sending Defaults
  default_daily_send_limit: 100,
  default_send_window_start: '09:00',
  default_send_window_end: '17:00',
  default_send_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  default_min_delay_minutes: 2,
  default_max_delay_minutes: 8,

  // Lead Scoring Weights
  score_email_opened: 1,
  score_link_clicked: 3,
  score_reply: 5,
  score_meeting_booked: 10,

  // Auto-Pause Thresholds
  bounce_rate_threshold: 5,
  spam_rate_threshold: 1,

  // Email Warm-up Defaults
  warmup_duration_days: 30,
  warmup_start_limit: 2,
  warmup_ramp_strategy: 'linear',

  // AI Configuration
  email_generation_model: 'claude-haiku-3-5',
  ai_agent_model: 'claude-sonnet-4-5-20250514',
  ai_agent_enabled: false,
  ai_agent_check_interval: '2h',
  ai_agent_auto_pause: true,

  // Notifications
  notify_reply_received: true,
  notify_campaign_paused: true,
  notify_smtp_degraded: true,
  notify_smtp_failed: true,
  notify_bounce_threshold: true,
  notify_spam_threshold: true,

  // Platform
  timezone: 'America/New_York',
  unsubscribe_page_text: '',
};

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { isAdmin } = useAuth();

  // Data state
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // ── Fetch settings ─────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/settings');
      const data = res.data || {};
      setSettings((prev) => ({
        ...prev,
        ...data,
        // Ensure arrays are parsed properly
        default_send_days: Array.isArray(data.default_send_days)
          ? data.default_send_days
          : (typeof data.default_send_days === 'string'
              ? JSON.parse(data.default_send_days)
              : prev.default_send_days),
      }));
    } catch (err) {
      setError(err.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ── Auto-dismiss toast ──────────────────────────────────────────────
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Update helpers ──────────────────────────────────────────────────
  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSendDay = (day) => {
    setSettings((prev) => ({
      ...prev,
      default_send_days: prev.default_send_days.includes(day)
        ? prev.default_send_days.filter((d) => d !== day)
        : [...prev.default_send_days, day],
    }));
  };

  const toggleNotification = (key) => {
    const settingKey = `notify_${key}`;
    setSettings((prev) => ({
      ...prev,
      [settingKey]: !prev[settingKey],
    }));
  };

  // ── Save ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await api.put('/settings', settings);
      setToast({ type: 'success', message: 'Settings saved successfully.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading settings...</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure global platform settings and defaults.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl text-sm border ${
            toast.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className={`ml-auto ${toast.type === 'success' ? 'text-green-500 hover:text-green-700' : 'text-red-500 hover:text-red-700'}`}
          >
            &times;
          </button>
        </div>
      )}

      {/* ── Section 1: Sending Defaults ──────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Mail className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">Sending Defaults</h2>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Daily Send Limit
              </label>
              <input
                type="number"
                value={settings.default_daily_send_limit}
                onChange={(e) => updateSetting('default_daily_send_limit', parseInt(e.target.value, 10) || 1)}
                min={1}
                max={10000}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Delay (min)
              </label>
              <input
                type="number"
                value={settings.default_min_delay_minutes}
                onChange={(e) => updateSetting('default_min_delay_minutes', parseInt(e.target.value, 10) || 0)}
                min={0}
                max={120}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Delay (min)
              </label>
              <input
                type="number"
                value={settings.default_max_delay_minutes}
                onChange={(e) => updateSetting('default_max_delay_minutes', parseInt(e.target.value, 10) || 0)}
                min={0}
                max={120}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                Send Window Start
              </label>
              <input
                type="time"
                value={settings.default_send_window_start}
                onChange={(e) => updateSetting('default_send_window_start', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                Send Window End
              </label>
              <input
                type="time"
                value={settings.default_send_window_end}
                onChange={(e) => updateSetting('default_send_window_end', e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Default Send Days</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const active = settings.default_send_days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleSendDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lead Scoring Weights */}
          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-800 mb-3">Lead Scoring Weights</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Opened Score
                </label>
                <input
                  type="number"
                  value={settings.score_email_opened}
                  onChange={(e) => updateSetting('score_email_opened', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={100}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link Clicked Score
                </label>
                <input
                  type="number"
                  value={settings.score_link_clicked}
                  onChange={(e) => updateSetting('score_link_clicked', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={100}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reply Score
                </label>
                <input
                  type="number"
                  value={settings.score_reply}
                  onChange={(e) => updateSetting('score_reply', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={100}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meeting Booked Score
                </label>
                <input
                  type="number"
                  value={settings.score_meeting_booked}
                  onChange={(e) => updateSetting('score_meeting_booked', parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={100}
                  className="input-field"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Points assigned to leads based on their engagement actions.
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 2: Auto-Pause Thresholds ─────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">Auto-Pause Thresholds</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bounce Rate Threshold (%)
            </label>
            <input
              type="number"
              value={settings.bounce_rate_threshold}
              onChange={(e) => updateSetting('bounce_rate_threshold', parseFloat(e.target.value) || 0)}
              min={0}
              max={100}
              step={0.5}
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">
              Campaigns will auto-pause when bounce rate exceeds this percentage.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Spam Complaint Rate Threshold (%)
            </label>
            <input
              type="number"
              value={settings.spam_rate_threshold}
              onChange={(e) => updateSetting('spam_rate_threshold', parseFloat(e.target.value) || 0)}
              min={0}
              max={100}
              step={0.1}
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">
              Campaigns will auto-pause when spam rate exceeds this percentage.
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 2.5: Email Warm-up Defaults ──────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Flame className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">Email Warm-up Defaults</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Warmup Duration (days)
            </label>
            <input
              type="number"
              value={settings.warmup_duration_days}
              onChange={(e) => updateSetting('warmup_duration_days', parseInt(e.target.value, 10) || 1)}
              min={1}
              max={365}
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">
              Number of days for the warm-up period.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Warmup Start Limit
            </label>
            <input
              type="number"
              value={settings.warmup_start_limit}
              onChange={(e) => updateSetting('warmup_start_limit', parseInt(e.target.value, 10) || 1)}
              min={1}
              max={100}
              className="input-field"
            />
            <p className="text-xs text-gray-400 mt-1">
              Number of emails to send on day one of warm-up.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Warmup Ramp Strategy
            </label>
            <div className="relative">
              <select
                value={settings.warmup_ramp_strategy}
                onChange={(e) => updateSetting('warmup_ramp_strategy', e.target.value)}
                className="select-field !pr-8"
              >
                <option value="linear">Linear</option>
                <option value="exponential">Exponential</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              How the sending limit increases over the warm-up period.
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 3: AI Configuration ──────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Brain className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">AI Configuration</h2>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Generation Model
              </label>
              <div className="relative">
                <select
                  value={settings.email_generation_model}
                  onChange={(e) => updateSetting('email_generation_model', e.target.value)}
                  className="select-field !pr-8"
                >
                  {AI_MODEL_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.models.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Model used to generate outreach email content.
                API keys are managed in <a href="/integrations" className="text-brand-600 hover:underline">Integrations &rarr; API Keys</a>.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Agent Model
              </label>
              <div className="relative">
                <select
                  value={settings.ai_agent_model}
                  onChange={(e) => updateSetting('ai_agent_model', e.target.value)}
                  className="select-field !pr-8"
                >
                  {AI_MODEL_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.models.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Model used by the AI agent for autonomous monitoring.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.ai_agent_enabled}
                onChange={(e) => updateSetting('ai_agent_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
            <div>
              <span className="text-sm font-medium text-gray-700">AI Agent Enabled</span>
              <p className="text-xs text-gray-400">Allow the AI agent to autonomously monitor and manage campaigns.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Agent Check Interval
              </label>
              <div className="relative">
                <select
                  value={settings.ai_agent_check_interval}
                  onChange={(e) => updateSetting('ai_agent_check_interval', e.target.value)}
                  className="select-field !pr-8"
                >
                  {CHECK_INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                How often the AI agent checks campaign health and performance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.ai_agent_auto_pause}
                onChange={(e) => updateSetting('ai_agent_auto_pause', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
            <div>
              <span className="text-sm font-medium text-gray-700">AI Agent Auto-Pause Campaigns</span>
              <p className="text-xs text-gray-400">Allow the AI agent to automatically pause campaigns with poor performance.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 4: Notifications ─────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Bell className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Choose which events trigger notifications.
        </p>

        <div className="space-y-3">
          {NOTIFICATION_EVENTS.map((event) => {
            const settingKey = `notify_${event.key}`;
            const isChecked = settings[settingKey] !== false;
            return (
              <label
                key={event.key}
                className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                  isChecked
                    ? 'border-brand-200 bg-brand-50/50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleNotification(event.key)}
                  className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">{event.label}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Section 5: Platform ──────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Globe className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900">Platform</h2>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <div className="relative">
              <select
                value={settings.timezone}
                onChange={(e) => updateSetting('timezone', e.target.value)}
                className="select-field !pr-8"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              All timestamps and scheduling will use this timezone.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unsubscribe Page Text
            </label>
            <textarea
              value={settings.unsubscribe_page_text}
              onChange={(e) => updateSetting('unsubscribe_page_text', e.target.value)}
              rows={4}
              placeholder="We're sorry to see you go. You have been successfully unsubscribed and will no longer receive emails from us."
              className="input-field resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Text displayed on the unsubscribe confirmation page.
            </p>
          </div>
        </div>
      </div>

      {/* ── Save Button ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <button
          onClick={fetchSettings}
          className="btn-secondary"
          disabled={saving}
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
