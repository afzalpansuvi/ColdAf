import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import {
  User, Shield, Bell, KeyRound, AlertTriangle, Check, Loader2,
  Eye, EyeOff, Copy, Trash2, Plus, Users, Building2, CreditCard,
  BarChart3, Settings as SettingsIcon, ScrollText, Crown,
  RefreshCw, Ban, CheckCircle, Search, ChevronDown, Mail,
  TrendingUp, DollarSign, Activity, UserCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// All possible tabs — rendered list is filtered per-role in Account component
// ---------------------------------------------------------------------------
const ALL_TABS = [
  // ── Personal ──────────────────────────────────────────────────────────────
  { id: 'profile',         label: 'Profile',         icon: User,          desc: 'Name, avatar, timezone, locale',         group: 'personal' },
  { id: 'security',        label: 'Security',         icon: Shield,        desc: 'Password, 2FA, active sessions',         group: 'personal' },
  { id: 'notifications',   label: 'Notifications',    icon: Bell,          desc: 'Email & in-app alerts per event',        group: 'personal' },
  { id: 'api-keys',        label: 'API Keys',         icon: KeyRound,      desc: 'Personal access tokens',                 group: 'personal' },
  { id: 'preferences',     label: 'Preferences',      icon: SettingsIcon,  desc: 'Appearance and defaults',                group: 'personal' },
  { id: 'danger',          label: 'Danger Zone',      icon: AlertTriangle, desc: 'Delete account, transfer ownership',     group: 'personal', danger: true },
  // ── Organization (admin only) ─────────────────────────────────────────────
  { id: 'team',            label: 'Team Members',     icon: Users,         desc: 'Manage users and roles',                 group: 'org',      adminOnly: true },
  { id: 'organization',    label: 'Organization',     icon: Building2,     desc: 'Org name, plan, API keys',               group: 'org',      adminOnly: true },
  { id: 'billing',         label: 'Billing & Plans',  icon: CreditCard,    desc: 'Subscription, usage, invoices',          group: 'org',      adminOnly: true },
  { id: 'ai-usage',        label: 'API Usage',        icon: BarChart3,     desc: 'AI token usage and cost breakdown',      group: 'org',      adminOnly: true },
  // ── System (admin only) ───────────────────────────────────────────────────
  { id: 'system-settings', label: 'System Settings',  icon: SettingsIcon,  desc: 'Global platform configuration',          group: 'system',   adminOnly: true },
  { id: 'audit-log',       label: 'Audit Log',        icon: ScrollText,    desc: 'All user and system actions',            group: 'system',   adminOnly: true },
  // ── Platform (owner email only) ───────────────────────────────────────────
  { id: 'platform-admin',  label: 'Platform Admin',   icon: Crown,         desc: 'All orgs, approvals, super admins',      group: 'platform', ownerEmail: 'apansuvi1@gmail.com' },
];

const GROUP_LABELS = {
  personal: 'Personal',
  org:      'Organization',
  system:   'System',
  platform: 'Platform',
};

// ---------------------------------------------------------------------------
// Main Account component
// ---------------------------------------------------------------------------
export default function Account() {
  const { user, isOrgAdmin, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter tabs by role
  const visibleTabs = ALL_TABS.filter(t => {
    if (t.ownerEmail) return user?.email === t.ownerEmail;
    if (t.adminOnly) return isAdmin || isOrgAdmin;
    return true;
  });

  const validIds = new Set(visibleTabs.map(t => t.id));
  const initial = searchParams.get('tab') || 'profile';
  const [active, setActive] = useState(validIds.has(initial) ? initial : 'profile');

  // Sync tab from URL (e.g. when orgMenu deep-links to /account?tab=billing)
  useEffect(() => {
    const q = searchParams.get('tab');
    if (q && q !== active && validIds.has(q)) setActive(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTab = (id) => {
    setActive(id);
    setSearchParams({ tab: id });
  };

  // Group the visible tabs
  const groups = {};
  visibleTabs.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile, team, billing, and platform settings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Left rail */}
        <nav className="space-y-4">
          {Object.entries(groups).map(([group, tabs]) => (
            <div key={group}>
              <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {GROUP_LABELS[group]}
              </p>
              <div className="space-y-0.5">
                {tabs.map(t => {
                  const Icon = t.icon;
                  const isActive = active === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${
                        isActive
                          ? t.group === 'platform'
                            ? 'bg-amber-50 text-amber-800 shadow-sm'
                            : 'bg-brand-50 text-brand-700 shadow-sm'
                          : t.danger
                            ? 'text-red-600 hover:bg-red-50'
                            : t.group === 'platform'
                              ? 'text-amber-700 hover:bg-amber-50'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        isActive
                          ? t.group === 'platform' ? 'text-amber-600' : 'text-brand-600'
                          : t.danger ? 'text-red-500'
                          : t.group === 'platform' ? 'text-amber-500'
                          : 'text-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className={`text-[11px] mt-0.5 ${
                          isActive
                            ? t.group === 'platform' ? 'text-amber-600/70' : 'text-brand-600/70'
                            : t.danger ? 'text-red-500/70'
                            : 'text-gray-400'
                        }`}>
                          {t.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Right panel */}
        <div className={`bg-white rounded-xl border shadow-sm ${
          active === 'platform-admin'
            ? 'border-amber-200'
            : 'border-gray-200/70'
        }`}>
          {active === 'profile'          && <ProfileTab />}
          {active === 'security'         && <SecurityTab />}
          {active === 'notifications'    && <NotificationsTab />}
          {active === 'api-keys'         && <ApiKeysTab />}
          {active === 'preferences'      && <PreferencesTab />}
          {active === 'danger'           && <DangerZoneTab />}
          {active === 'team'             && <TeamMembersTab />}
          {active === 'organization'     && <OrganizationTab />}
          {active === 'billing'          && <BillingTab />}
          {active === 'ai-usage'         && <ApiUsageTab />}
          {active === 'system-settings'  && <SystemSettingsTab />}
          {active === 'audit-log'        && <AuditLogTab />}
          {active === 'platform-admin'   && <PlatformAdminTab />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function SectionHeader({ title, subtitle, badge }) {
  return (
    <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {badge}
    </div>
  );
}

function Field({ label, hint, children, required }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-colors ${props.className || ''}`}
    />
  );
}

function SaveBar({ onSave, saving, saved, onReset, disabled }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between rounded-b-xl">
      <div className="text-xs text-gray-500">
        {saved && (
          <span className="inline-flex items-center gap-1 text-green-600">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || disabled}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 rounded-lg transition-colors inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
function ProfileTab() {
  const { user, fetchUser } = useAuth();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', title: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    locale: navigator.language || 'en-US',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    setForm(f => ({
      ...f,
      name: user.name || user.fullName || '',
      email: user.email || '',
      phone: user.phone || '',
      title: user.title || '',
      timezone: user.timezone || f.timezone,
      locale: user.locale || f.locale,
    }));
  }, [user]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      await api.put('/auth/profile', form);
      setSaved(true);
      fetchUser?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message || 'Could not save profile');
    } finally { setSaving(false); }
  };

  return (
    <>
      <SectionHeader title="Profile" subtitle="How your teammates see you across ColdAF." />
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-purple flex items-center justify-center text-white text-xl font-bold shadow-sm">
            {(form.name || form.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Profile photo</p>
            <p className="text-xs text-gray-500 mb-2">PNG or JPG under 1MB.</p>
            <button className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
              Upload
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full name" required><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" /></Field>
          <Field label="Email" required hint="Used for login and notifications."><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Job title"><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Head of Growth" /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 123 4567" /></Field>
          <Field label="Timezone"><Input value={form.timezone} onChange={e => set('timezone', e.target.value)} /></Field>
          <Field label="Language">
            <select value={form.locale} onChange={e => set('locale', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es-ES">Español</option>
              <option value="fr-FR">Français</option>
              <option value="de-DE">Deutsch</option>
            </select>
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <SaveBar onSave={save} saving={saving} saved={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------
function SecurityTab() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [twoFA, setTwoFA] = useState({ enabled: false, loading: false });
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/auth/sessions');
        setSessions(res.data?.data?.sessions || res.data?.data || []);
      } catch {
        setSessions([{ id: 'current', device: 'This browser', ip: '—', lastActive: new Date().toISOString(), current: true }]);
      }
      try {
        const res = await api.get('/auth/2fa/status');
        setTwoFA({ enabled: !!res.data?.data?.enabled, loading: false });
      } catch { /* leave default */ }
    })();
  }, []);

  const changePassword = async () => {
    setError(null); setSaved(false);
    if (!form.current || !form.next) return setError('Please fill both password fields.');
    if (form.next.length < 8) return setError('New password must be at least 8 characters.');
    if (form.next !== form.confirm) return setError('Passwords do not match.');
    setSaving(true);
    try {
      await api.put('/auth/password', { currentPassword: form.current, newPassword: form.next });
      setSaved(true);
      setForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e.message || 'Could not change password'); }
    setSaving(false);
  };

  const toggle2FA = async () => {
    setTwoFA(s => ({ ...s, loading: true }));
    try {
      if (twoFA.enabled) { await api.post('/auth/2fa/disable'); setTwoFA({ enabled: false, loading: false }); }
      else { await api.post('/auth/2fa/enable'); setTwoFA({ enabled: true, loading: false }); }
    } catch { setTwoFA(s => ({ ...s, loading: false })); }
  };

  const revokeSession = async (id) => {
    try { await api.delete(`/auth/sessions/${id}`); } catch { /* ignore */ }
    setSessions(s => s.filter(x => x.id !== id));
  };

  return (
    <>
      <SectionHeader title="Security" subtitle="Keep your account protected." />
      <div className="p-6 space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Change password</h3>
          <div className="space-y-3 max-w-md">
            <Field label="Current password" required>
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label="New password" required hint="At least 8 characters, mix of letters and numbers.">
              <Input type={show ? 'text' : 'password'} value={form.next} onChange={e => setForm(f => ({ ...f, next: e.target.value }))} />
            </Field>
            <Field label="Confirm new password" required>
              <Input type={show ? 'text' : 'password'} value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={changePassword} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 rounded-lg inline-flex items-center gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saved ? 'Password updated ✓' : 'Update password'}
            </button>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Two-factor authentication</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {twoFA.enabled ? 'Your account is protected with a second factor.' : 'Add an authenticator app for extra security.'}
              </p>
            </div>
            <button onClick={toggle2FA} disabled={twoFA.loading}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                twoFA.enabled ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-white bg-brand-600 hover:bg-brand-700'
              }`}>
              {twoFA.loading ? '…' : twoFA.enabled ? 'Disable 2FA' : 'Enable 2FA'}
            </button>
          </div>
        </section>

        <section className="border-t border-gray-100 pt-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Active sessions</h3>
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-500">No other active sessions.</p>
            ) : sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {s.device || s.userAgent || 'Unknown device'}
                    {s.current && <span className="ml-2 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">CURRENT</span>}
                  </p>
                  <p className="text-xs text-gray-500">{s.ip || '—'} · Last active {s.lastActive ? new Date(s.lastActive).toLocaleString() : 'recently'}</p>
                </div>
                {!s.current && (
                  <button onClick={() => revokeSession(s.id)} className="text-xs text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg">Revoke</button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
const NOTIF_EVENTS = [
  { key: 'reply_received',    label: 'New reply received',       desc: 'When a prospect replies to any of your campaigns.' },
  { key: 'campaign_completed', label: 'Campaign completed',      desc: 'When a campaign finishes sending its last step.' },
  { key: 'bounce_detected',   label: 'Hard bounce detected',     desc: 'Protect domain reputation by catching bad addresses.' },
  { key: 'daily_summary',     label: 'Daily performance digest', desc: 'One email per day summarizing sends, opens, replies.' },
  { key: 'billing_alerts',    label: 'Billing & invoice alerts', desc: 'Payment failures, renewals, quota warnings.' },
  { key: 'team_activity',     label: 'Team activity',            desc: 'Invites accepted, role changes, removed members.' },
];

function NotificationsTab() {
  const [prefs, setPrefs] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/notifications/preferences');
        setPrefs(res.data?.data?.preferences || res.data?.data || {});
      } catch {
        const def = {};
        NOTIF_EVENTS.forEach(e => { def[e.key] = { email: true, in_app: true }; });
        setPrefs(def);
      }
    })();
  }, []);

  const toggle = (key, channel) => {
    setPrefs(p => ({ ...p, [key]: { ...(p[key] || {}), [channel]: !(p[key]?.[channel]) } }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try { await api.put('/notifications/preferences', { preferences: prefs }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <>
      <SectionHeader title="Notifications" subtitle="Pick how you want to be reached for each event." />
      <div className="p-6">
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_80px] px-4 py-2.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            <span>Event</span><span className="text-center">Email</span><span className="text-center">In-app</span>
          </div>
          {NOTIF_EVENTS.map(e => (
            <div key={e.key} className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-800">{e.label}</p>
                <p className="text-xs text-gray-500">{e.desc}</p>
              </div>
              <div className="flex justify-center"><Toggle on={!!prefs[e.key]?.email} onChange={() => toggle(e.key, 'email')} /></div>
              <div className="flex justify-center"><Toggle on={!!prefs[e.key]?.in_app} onChange={() => toggle(e.key, 'in_app')} /></div>
            </div>
          ))}
        </div>
      </div>
      <SaveBar onSave={save} saving={saving} saved={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// API Keys (personal tokens)
// ---------------------------------------------------------------------------
function ApiKeysTab() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/auth/tokens');
        setKeys(res.data?.data?.tokens || res.data?.data || []);
      } catch { setKeys([]); }
      setLoading(false);
    })();
  }, []);

  const create = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/auth/tokens', { name: newKeyName.trim() });
      const token = res.data?.data;
      setNewKeyValue(token?.token || token?.value || 'ck_demo_' + Math.random().toString(36).slice(2));
      setKeys(k => [{ id: token?.id || Date.now(), name: newKeyName, lastUsed: null, createdAt: new Date().toISOString() }, ...k]);
      setNewKeyName('');
    } catch { alert('Could not create token.'); }
    setCreating(false);
  };

  const revoke = async (id) => {
    if (!window.confirm('Revoke this API key? Any integrations using it will stop working.')) return;
    try { await api.delete(`/auth/tokens/${id}`); } catch { /* ignore */ }
    setKeys(k => k.filter(x => x.id !== id));
  };

  return (
    <>
      <SectionHeader title="Personal API Keys" subtitle="Use these tokens to call the ColdAF API on your behalf." />
      <div className="p-6 space-y-6">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Token name" hint="e.g. 'Zapier integration' — name is for your reference only.">
              <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="My integration" />
            </Field>
          </div>
          <button onClick={create} disabled={creating || !newKeyName.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 rounded-lg inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create token
          </button>
        </div>

        {newKeyValue && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900 mb-1">Save this token now — you won't see it again</p>
            <div className="flex items-center gap-2 bg-white rounded border border-amber-200 px-3 py-2 mt-2">
              <code className="text-xs text-gray-800 font-mono truncate flex-1">{newKeyValue}</code>
              <button onClick={() => navigator.clipboard?.writeText(newKeyValue)} className="text-amber-700 hover:bg-amber-100 p-1.5 rounded">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => setNewKeyValue(null)} className="mt-3 text-xs text-amber-700 hover:underline">I saved it — dismiss</button>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Your tokens</h3>
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            : keys.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center bg-gray-50 rounded-lg">No tokens yet. Create one above to get started.</p>
            ) : (
              <div className="rounded-lg border border-gray-100 divide-y divide-gray-100">
                {keys.map(k => (
                  <div key={k.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{k.name}</p>
                      <p className="text-xs text-gray-500">
                        Created {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—'}
                        {k.lastUsed && ` · Last used ${new Date(k.lastUsed).toLocaleDateString()}`}
                      </p>
                    </div>
                    <button onClick={() => revoke(k.id)} className="text-xs text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------
function PreferencesTab() {
  const [prefs, setPrefs] = useState({
    theme: localStorage.getItem('theme') || 'system',
    density: localStorage.getItem('density') || 'comfortable',
    defaultLanding: localStorage.getItem('defaultLanding') || '/',
  });
  const [saved, setSaved] = useState(false);

  const save = () => {
    Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <SectionHeader title="Preferences" subtitle="Customize the look and defaults of your workspace." />
      <div className="p-6 space-y-5 max-w-lg">
        <Field label="Theme">
          <div className="grid grid-cols-3 gap-2">
            {['light', 'dark', 'system'].map(t => (
              <button key={t} onClick={() => setPrefs(p => ({ ...p, theme: t }))}
                className={`px-3 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                  prefs.theme === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>{t}</button>
            ))}
          </div>
        </Field>
        <Field label="Density" hint="Compact packs more rows into each screen.">
          <div className="grid grid-cols-2 gap-2">
            {['comfortable', 'compact'].map(d => (
              <button key={d} onClick={() => setPrefs(p => ({ ...p, density: d }))}
                className={`px-3 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                  prefs.density === d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>{d}</button>
            ))}
          </div>
        </Field>
        <Field label="Default landing page" hint="Where you land after login.">
          <select value={prefs.defaultLanding} onChange={e => setPrefs(p => ({ ...p, defaultLanding: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
            <option value="/">Dashboard</option>
            <option value="/replies">Inbox</option>
            <option value="/campaigns">Campaigns</option>
            <option value="/leads">Leads</option>
            <option value="/analytics">Analytics</option>
          </select>
        </Field>
      </div>
      <SaveBar onSave={save} saved={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone
// ---------------------------------------------------------------------------
function DangerZoneTab() {
  const { user, logout } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const canDelete = confirm === user?.email;

  const doDelete = async () => {
    if (!canDelete) return;
    if (!window.confirm('This cannot be undone. Are you absolutely sure?')) return;
    setDeleting(true);
    try { await api.delete('/auth/me'); logout(); }
    catch (e) { alert(e.message || 'Could not delete account'); }
    setDeleting(false);
  };

  return (
    <>
      <SectionHeader title="Danger Zone" subtitle="Irreversible actions. Handle with care." />
      <div className="p-6 space-y-5">
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900">Delete my account</h3>
              <p className="text-xs text-red-700/80 mt-1">
                This will permanently delete your personal login. If you are the only admin, you must transfer
                organization ownership to another team member first.
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-red-700 font-medium">
                  Type your email (<span className="font-mono">{user?.email}</span>) to confirm:
                </p>
                <Input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={user?.email} className="max-w-sm" />
                <button onClick={doDelete} disabled={!canDelete || deleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-lg inline-flex items-center gap-2">
                  {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Delete my account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------
function TeamMembersTab() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('sales');
  const [inviting, setInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/organizations/members');
      setMembers(res.data || []);
    } catch { setMembers([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post('/organizations/invite', { email: inviteEmail.trim(), role: inviteRole });
      setInviteSent(true);
      setInviteEmail('');
      setTimeout(() => setInviteSent(false), 3000);
    } catch (e) { alert(e.message || 'Failed to send invite'); }
    setInviting(false);
  };

  const ROLE_COLORS = {
    org_admin:    'bg-purple-100 text-purple-700',
    org_manager:  'bg-blue-100 text-blue-700',
    sales:        'bg-green-100 text-green-700',
    email_manager:'bg-amber-100 text-amber-700',
    developer:    'bg-gray-100 text-gray-700',
  };

  return (
    <>
      <SectionHeader title="Team Members" subtitle="Manage who has access to your organization." />
      <div className="p-6 space-y-6">
        {/* Invite */}
        <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-brand-600" /> Invite a team member
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:border-brand-400 focus:outline-none"
            >
              <option value="sales">Sales Rep</option>
              <option value="email_manager">Email Manager</option>
              <option value="org_manager">Manager</option>
              <option value="org_admin">Admin</option>
              <option value="developer">Developer</option>
            </select>
            <button
              onClick={invite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 rounded-lg inline-flex items-center gap-2 whitespace-nowrap"
            >
              {inviting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {inviteSent ? '✓ Invite sent!' : 'Send invite'}
            </button>
          </div>
        </div>

        {/* Members table */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="rounded-lg border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_100px_80px] px-4 py-2.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <span>Member</span><span>Role</span><span>Status</span><span></span>
            </div>
            {members.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No members found.</div>
            ) : members.map(m => (
              <div key={m.id} className="grid grid-cols-[1fr_140px_100px_80px] items-center px-4 py-3 border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.fullName || m.name || '—'}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
                <div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${ROLE_COLORS[m.role] || 'bg-gray-100 text-gray-700'}`}>
                    {(m.role || 'user').replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className={`inline-flex items-center gap-1 text-xs ${m.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {m.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex justify-end">
                  <button className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------
function OrganizationTab() {
  const { organization } = useAuth();
  const [form, setForm] = useState({ name: '', domain: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [orgData, setOrgData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/organizations');
        const org = res.data || {};
        setOrgData(org);
        setForm({ name: org.name || '', domain: org.domain || '' });
      } catch {
        setForm({ name: organization?.name || '', domain: '' });
      }
    })();
  }, [organization]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/organizations', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert(e.message || 'Could not save'); }
    setSaving(false);
  };

  const PLAN_COLORS = {
    free: 'bg-gray-100 text-gray-700',
    starter: 'bg-blue-100 text-blue-700',
    pro: 'bg-brand-100 text-brand-700',
    agency: 'bg-purple-100 text-purple-700',
  };

  return (
    <>
      <SectionHeader
        title="Organization"
        subtitle="Your organization's identity and plan details."
        badge={orgData?.plan && (
          <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${PLAN_COLORS[orgData.plan] || 'bg-gray-100 text-gray-700'}`}>
            {orgData.plan} plan
          </span>
        )}
      />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Organization name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Company" />
          </Field>
          <Field label="Organization slug" hint="Used in your workspace URL (read-only).">
            <Input value={orgData?.slug || ''} disabled className="bg-gray-50 text-gray-500 cursor-not-allowed" />
          </Field>
          <Field label="Primary domain" hint="Your company's primary domain for email verification.">
            <Input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="company.com" />
          </Field>
          <Field label="Plan" hint="To change your plan, go to Billing & Plans.">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
              <span className="capitalize text-sm font-medium text-gray-700">{orgData?.plan || 'Free'}</span>
            </div>
          </Field>
        </div>

        {orgData?.usage && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Current Usage</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Emails Sent', used: orgData.usage.emailsSent, max: orgData.usage.maxEmails },
                { label: 'Phone Min', used: orgData.usage.phoneMinutes, max: orgData.usage.maxPhoneMinutes },
                { label: 'Users', used: orgData.usage.maxUsers, max: orgData.usage.maxUsers },
                { label: 'Brands', used: orgData.usage.maxBrands, max: orgData.usage.maxBrands },
              ].map(({ label, used, max }) => (
                <div key={label} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-base font-bold text-gray-800">
                    {(used || 0).toLocaleString()}
                    {max && max < 999999 && <span className="text-xs font-normal text-gray-400"> / {max.toLocaleString()}</span>}
                    {max && max >= 999999 && <span className="text-xs font-normal text-gray-400"> / ∞</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <SaveBar onSave={save} saving={saving} saved={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Billing & Plans
// ---------------------------------------------------------------------------
function BillingTab() {
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [ur, pr] = await Promise.all([api.get('/billing/usage'), api.get('/billing/plans')]);
        setUsage(ur.data ?? ur);
        const payload = pr.data ?? pr;
        setPlans(Array.isArray(payload) ? payload : []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const currentPlan = usage?.plan || 'free';

  const handleUpgrade = async (planId) => {
    try {
      const res = await api.post('/billing/checkout-session', { planId });
      if (res.url) window.location.href = res.url;
      else alert('Stripe Checkout is not configured yet — this would redirect to payment in production.');
    } catch {
      alert('Stripe Checkout would open here in production. (Backend not connected in demo mode.)');
    }
  };

  const handlePortal = async () => {
    try {
      const res = await api.post('/billing/portal-session');
      if (res.url) window.location.href = res.url;
      else alert('Billing portal is not configured yet — this would redirect to Stripe Portal in production.');
    } catch {
      alert('Stripe Billing Portal would open here in production.');
    }
  };

  const PLAN_GRADIENT = {
    free:    'from-gray-50 to-gray-100 border-gray-200',
    starter: 'from-blue-50 to-blue-100 border-blue-200',
    pro:     'from-brand-50 to-brand-100 border-brand-200',
    agency:  'from-purple-50 to-purple-100 border-purple-300',
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;

  return (
    <>
      <SectionHeader title="Billing & Plans" subtitle="Manage your subscription, usage, and invoices." />
      <div className="p-6 space-y-6">
        {/* Current plan / usage */}
        {usage && (
          <div className="p-4 rounded-xl border border-brand-200 bg-brand-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-brand-600 font-semibold uppercase tracking-wide">Current Plan</p>
                <p className="text-xl font-bold text-brand-900 capitalize">{usage.planName || currentPlan}</p>
              </div>
              <button onClick={handlePortal}
                className="px-4 py-2 text-sm font-medium text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 rounded-lg transition-colors">
                Manage Billing
              </button>
            </div>
            {usage.usage && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {[
                  { label: 'Emails', used: usage.usage.emails?.used, limit: usage.usage.emails?.limit, pct: usage.usage.emails?.percentage },
                  { label: 'Phone Min', used: Math.round(usage.usage.phoneMinutes?.used || 0), limit: usage.usage.phoneMinutes?.limit, pct: usage.usage.phoneMinutes?.percentage },
                  { label: 'Users', used: usage.usage.users?.used, limit: usage.usage.users?.limit },
                  { label: 'Brands', used: usage.usage.brands?.used, limit: usage.usage.brands?.limit },
                ].map(({ label, used, limit, pct }) => (
                  <div key={label} className="bg-white rounded-lg p-3 border border-brand-100">
                    <p className="text-[11px] text-gray-500 mb-1">{label}</p>
                    <p className="text-sm font-bold text-gray-800">
                      {(used || 0).toLocaleString()}
                      <span className="text-xs font-normal text-gray-400">
                        {limit === 'Unlimited' || limit >= 999999 ? ' / ∞' : limit ? ` / ${Number(limit).toLocaleString()}` : ''}
                      </span>
                    </p>
                    {pct != null && (
                      <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-400' : 'bg-brand-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Plan cards */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Available Plans</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plans.map(plan => {
              const isCurrent = plan.id === currentPlan;
              return (
                <div key={plan.id}
                  className={`relative rounded-xl border bg-gradient-to-br p-4 ${PLAN_GRADIENT[plan.id] || 'from-gray-50 to-gray-100 border-gray-200'} ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}>
                  {isCurrent && (
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-600 text-white uppercase">Current</span>
                  )}
                  <div className="mb-3">
                    <p className="text-base font-bold text-gray-900">{plan.name}</p>
                    <p className="text-2xl font-black text-gray-900 mt-0.5">{plan.priceDisplay}</p>
                  </div>
                  <ul className="space-y-1 mb-4">
                    {plan.features?.slice(0, 5).map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                        <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {plan.purchasable && !isCurrent && (
                    <button onClick={() => handleUpgrade(plan.id)}
                      className="w-full py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors">
                      Upgrade to {plan.name}
                    </button>
                  )}
                  {isCurrent && (
                    <div className="w-full py-2 text-center text-sm font-semibold text-brand-700">✓ Your current plan</div>
                  )}
                  {!plan.purchasable && !isCurrent && (
                    <div className="w-full py-2 text-center text-sm text-gray-500">
                      {plan.id === 'free' ? 'Free forever' : 'Contact sales'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// API Usage (AI token usage & costs)
// ---------------------------------------------------------------------------
function ApiUsageTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/ai/usage/summary');
        setSummary(res.data ?? res);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;

  const totals = summary?.totals || {};
  const byProvider = summary?.byProvider || [];
  const byModel = summary?.byModel || [];

  const fmtTokens = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n || 0);
  const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

  const PROVIDER_COLOR = { anthropic: 'bg-orange-100 text-orange-700', openai: 'bg-green-100 text-green-700', google_gemini: 'bg-blue-100 text-blue-700' };

  return (
    <>
      <SectionHeader title="API Usage" subtitle="AI token consumption and cost breakdown across all providers." />
      <div className="p-6 space-y-6">
        {/* Top stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Tokens', value: fmtTokens(totals.totalTokens), icon: Activity, color: 'text-brand-600' },
            { label: 'Est. Cost (mo)', value: fmtCost(totals.estimatedCost), icon: DollarSign, color: 'text-green-600' },
            { label: 'Requests', value: (totals.requestCount || 0).toLocaleString(), icon: TrendingUp, color: 'text-blue-600' },
            { label: 'Input Tokens', value: fmtTokens(totals.inputTokens), icon: BarChart3, color: 'text-purple-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="p-4 rounded-xl border border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <p className="text-xs text-gray-500">{label}</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* By provider */}
        {byProvider.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">By Provider</h3>
            <div className="rounded-lg border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              <div className="grid grid-cols-[1fr_100px_100px_80px] px-4 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <span>Provider</span><span className="text-right">Tokens</span><span className="text-right">Cost</span><span className="text-right">Requests</span>
              </div>
              {byProvider.map(p => (
                <div key={p.provider} className="grid grid-cols-[1fr_100px_100px_80px] items-center px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium w-fit ${PROVIDER_COLOR[p.provider] || 'bg-gray-100 text-gray-700'}`}>
                    {p.provider}
                  </span>
                  <span className="text-sm text-right text-gray-700 tabular-nums">{fmtTokens(p.inputTokens + p.outputTokens)}</span>
                  <span className="text-sm text-right font-semibold text-gray-900 tabular-nums">{fmtCost(p.cost)}</span>
                  <span className="text-sm text-right text-gray-500 tabular-nums">{p.requestCount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By model */}
        {byModel.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">By Model</h3>
            <div className="rounded-lg border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_100px_80px] px-4 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <span>Model</span><span className="text-right">Provider</span><span className="text-right">Cost</span><span className="text-right">Reqs</span>
              </div>
              {byModel.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_100px_80px] items-center px-4 py-3">
                  <span className="text-sm font-mono text-gray-800">{m.model}</span>
                  <span className={`text-right text-[11px] font-medium px-1.5 py-0.5 rounded-full w-fit ml-auto ${PROVIDER_COLOR[m.provider] || 'bg-gray-100 text-gray-700'}`}>
                    {m.provider?.split('_')[0]}
                  </span>
                  <span className="text-sm text-right font-semibold text-gray-900 tabular-nums">{fmtCost(m.cost)}</span>
                  <span className="text-sm text-right text-gray-500 tabular-nums">{m.requestCount}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// System Settings
// ---------------------------------------------------------------------------
function SystemSettingsTab() {
  const [settings, setSettings] = useState({ maintenanceMode: false, registrationOpen: true, maxOrgsPerUser: 5, emailNotificationsEnabled: true, defaultPlan: 'free' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings');
        if (res.data && Object.keys(res.data).length) setSettings(s => ({ ...s, ...res.data }));
      } catch { /* use defaults */ }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <>
      <SectionHeader title="System Settings" subtitle="Global platform configuration affecting all organizations." />
      <div className="p-6 space-y-5">
        <div className="space-y-4">
          {[
            { key: 'maintenanceMode', label: 'Maintenance Mode', desc: 'Block all non-admin access when enabled.' },
            { key: 'registrationOpen', label: 'Open Registration', desc: 'Allow new users to sign up without an invite.' },
            { key: 'emailNotificationsEnabled', label: 'Email Notifications', desc: 'Send system emails (invites, alerts, digests).' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-4 rounded-lg border border-gray-100 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <Toggle on={!!settings[key]} onChange={() => setSettings(s => ({ ...s, [key]: !s[key] }))} />
            </div>
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Max Orgs Per User" hint="How many organizations a single user can create.">
              <Input
                type="number"
                value={settings.maxOrgsPerUser}
                onChange={e => setSettings(s => ({ ...s, maxOrgsPerUser: parseInt(e.target.value) || 1 }))}
                min={1} max={100}
              />
            </Field>
            <Field label="Default Plan for New Orgs">
              <select
                value={settings.defaultPlan}
                onChange={e => setSettings(s => ({ ...s, defaultPlan: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:outline-none"
              >
                <option value="free">Free</option>
                <option value="starter">Starter ($9/mo)</option>
                <option value="pro">Pro ($29/mo)</option>
              </select>
            </Field>
          </div>
        </div>
      </div>
      <SaveBar onSave={save} saving={saving} saved={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------
function AuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/audit-logs?${params}`);
      const d = res.data || res;
      setLogs(d.logs || []);
      setTotal(d.total || 0);
    } catch { setLogs([]); }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const ACTION_COLOR = {
    USER_LOGIN: 'bg-blue-100 text-blue-700',
    CREATE: 'bg-green-100 text-green-700',
    UPDATE: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-red-100 text-red-700',
    SEND: 'bg-purple-100 text-purple-700',
  };

  return (
    <>
      <SectionHeader title="Audit Log" subtitle="All user and system actions across your organization." />
      <div className="p-6 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search actions, users…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="rounded-lg border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_180px] px-4 py-2.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <span>Description</span><span>Action</span><span>When</span>
            </div>
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No audit log entries found.</div>
            ) : logs.map(l => (
              <div key={l.id} className="grid grid-cols-[1fr_120px_180px] items-center px-4 py-3 border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm text-gray-800">{l.description}</p>
                  <p className="text-xs text-gray-500">{l.actorName || l.actor_name || '—'}</p>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium w-fit ${ACTION_COLOR[l.actionType] || ACTION_COLOR[l.action_type] || 'bg-gray-100 text-gray-700'}`}>
                  {l.actionType || l.action_type || 'ACTION'}
                </span>
                <span className="text-xs text-gray-500">
                  {(l.createdAt || l.created_at) ? new Date(l.createdAt || l.created_at).toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {total > LIMIT && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{total} total entries</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
              <span className="px-3 py-1.5">{page} / {Math.ceil(total / LIMIT)}</span>
              <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Platform Admin (visible only to apansuvi1@gmail.com)
// ---------------------------------------------------------------------------
function PlatformAdminTab() {
  const [analytics, setAnalytics] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [pending, setPending] = useState([]);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgSearch, setOrgSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [ar, or, pr, sar] = await Promise.all([
          api.get('/platform/analytics'),
          api.get('/platform/organizations'),
          api.get('/platform/super-admins/pending'),
          api.get('/platform/super-admins'),
        ]);
        setAnalytics(ar.data ?? ar);
        setOrgs(or.data || []);
        setPending(pr.data || []);
        setSuperAdmins(sar.data || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const handleOrgAction = async (orgId, action) => {
    if (!window.confirm(`${action === 'suspend' ? 'Suspend' : 'Reactivate'} this organization?`)) return;
    try {
      await api.post(`/platform/organizations/${orgId}/${action}`);
      setOrgs(o => o.map(x => x.id === orgId ? { ...x, status: action === 'suspend' ? 'suspended' : 'active' } : x));
    } catch { alert('Action failed in demo mode.'); }
  };

  const handleApproval = async (id, approved) => {
    try {
      await api.post(`/platform/super-admins/${id}/${approved ? 'approve' : 'decline'}`);
      setPending(p => p.filter(x => x.id !== id));
    } catch { alert('Action failed in demo mode.'); }
  };

  const fmtRevenue = (cents) => `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

  const filteredOrgs = orgSearch
    ? orgs.filter(o => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
    : orgs;

  const PLAN_COLOR = { free: 'bg-gray-100 text-gray-600', starter: 'bg-blue-100 text-blue-700', pro: 'bg-brand-100 text-brand-700', agency: 'bg-purple-100 text-purple-700' };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-600" /></div>;

  return (
    <>
      <div className="px-6 py-5 border-b border-amber-200 bg-amber-50">
        <div className="flex items-center gap-2.5">
          <Crown className="w-5 h-5 text-amber-600" />
          <div>
            <h2 className="text-lg font-semibold text-amber-900">Platform Admin</h2>
            <p className="text-sm text-amber-700/80 mt-0.5">Full visibility and control across all organizations. Visible only to you.</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Stats row */}
        {analytics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Orgs', value: analytics.totalOrgs, icon: Building2, color: 'text-brand-600', bg: 'bg-brand-50' },
              { label: 'Total Users', value: analytics.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Emails Sent', value: (analytics.totalEmailsSent || 0).toLocaleString(), icon: Mail, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'MRR', value: fmtRevenue(analytics.mrr), icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`p-4 rounded-xl border border-amber-100 ${bg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pending approvals */}
        {pending.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-600" />
              Pending Platform Access Requests
              <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">{pending.length}</span>
            </h3>
            <div className="space-y-2">
              {pending.map(r => (
                <div key={r.id} className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{r.name} <span className="font-normal text-gray-500">— {r.email}</span></p>
                    <p className="text-xs text-gray-600 mt-0.5">{r.orgName}</p>
                    <p className="text-xs text-gray-500 mt-1 italic">"{r.reason}"</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => handleApproval(r.id, true)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg inline-flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleApproval(r.id, false)}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg inline-flex items-center gap-1">
                      <Ban className="w-3.5 h-3.5" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Organizations table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              All Organizations ({orgs.length})
            </h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={orgSearch}
                onChange={e => setOrgSearch(e.target.value)}
                placeholder="Search orgs…"
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:border-brand-400 focus:outline-none w-40"
              />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_60px_100px_80px_90px] px-4 py-2.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <span>Org Name</span><span>Plan</span><span>Users</span><span>Emails Sent</span><span>Status</span><span className="text-right">Actions</span>
            </div>
            {filteredOrgs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">No organizations found.</div>
            ) : filteredOrgs.map(o => (
              <div key={o.id} className={`grid grid-cols-[1fr_80px_60px_100px_80px_90px] items-center px-4 py-3 border-t border-gray-100 hover:bg-gray-50 transition-colors ${o.status === 'suspended' ? 'opacity-60' : ''}`}>
                <div>
                  <p className="text-sm font-medium text-gray-800">{o.name}</p>
                  <p className="text-xs text-gray-400">${((o.revenue || 0) / 100).toFixed(0)}/mo</p>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${PLAN_COLOR[o.plan] || 'bg-gray-100 text-gray-600'}`}>{o.plan}</span>
                <span className="text-sm text-gray-700 tabular-nums">{o.users}</span>
                <span className="text-sm text-gray-700 tabular-nums">{(o.emailsSent || 0).toLocaleString()}</span>
                <span className={`flex items-center gap-1 text-xs font-medium ${o.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${o.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                  {o.status}
                </span>
                <div className="flex justify-end">
                  {o.status === 'active' ? (
                    <button onClick={() => handleOrgAction(o.id, 'suspend')}
                      className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                      <Ban className="w-3 h-3" /> Suspend
                    </button>
                  ) : (
                    <button onClick={() => handleOrgAction(o.id, 'reactivate')}
                      className="text-xs text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Super admins */}
        {superAdmins.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" /> Super Admins ({superAdmins.length})
            </h3>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {superAdmins.map(sa => (
                <div key={sa.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{sa.name}</p>
                    <p className="text-xs text-gray-500">{sa.email} · {sa.orgCount || 0} orgs</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${sa.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {sa.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
