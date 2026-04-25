import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import {
  Loader2, Save, Building2, Globe, Key, Users, UserPlus,
  Trash2, AlertCircle, CheckCircle, Copy, Mail
} from 'lucide-react';

export default function OrganizationSettings() {
  const { organization, fetchUser } = useAuth();
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'ai-keys', label: 'AI Keys', icon: Key },
  ];

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100/50">
        {tabs.map((tab) => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-brand-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'members' && <MemberManagement />}
      {activeTab === 'ai-keys' && <AIKeysSettings />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// General Settings Tab
// ---------------------------------------------------------------------------
function GeneralSettings() {
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState({ name: '', website: '', customDomain: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const { data } = await api.get('/organizations');
        const o = data.data;
        setOrg(o);
        setForm({ name: o.name || '', website: o.website || '', customDomain: o.customDomain || '' });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchOrg();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api.put('/organizations', form);
      setMsg('Settings saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to save.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>;

  return (
    <div className="rounded-2xl p-6 max-w-2xl" style={{
      background: 'rgba(255, 255, 255, 0.72)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.35)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
    }}>
      <h3 className="text-lg font-bold text-gray-800 mb-1">Organization Settings</h3>
      <p className="text-sm text-gray-500 mb-6">Manage your organization details.</p>

      {org && (
        <div className="mb-6 p-3 rounded-xl bg-brand-50/50 border border-brand-100 text-sm">
          <span className="text-gray-500">Plan:</span>{' '}
          <span className="font-semibold text-brand-700 capitalize">{org.plan}</span>
          {org.usage && (
            <span className="ml-4 text-gray-400">
              {org.usage.emailsSent}/{org.usage.maxEmails === -1 ? 'Unlimited' : org.usage.maxEmails} emails
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
          <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
          <input type="url" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
            placeholder="https://yoursite.com"
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain</label>
          <input type="text" value={form.customDomain} onChange={e => setForm(p => ({ ...p, customDomain: e.target.value }))}
            placeholder="mail.yoursite.com"
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>

        {msg && (
          <div className={`flex items-center gap-2 text-sm ${msg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {msg.includes('Failed') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {msg}
          </div>
        )}

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member Management Tab
// ---------------------------------------------------------------------------
function MemberManagement() {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', roleId: '' });
  const [inviteResult, setInviteResult] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [membersRes, invitationsRes, rolesRes] = await Promise.all([
        api.get('/organizations/members'),
        api.get('/organizations/invitations'),
        api.get('/organizations/roles'),
      ]);
      setMembers(membersRes.data?.data || []);
      setInvitations(invitationsRes.data?.data || []);
      setRoles(rolesRes.data?.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setError('');
    setInviteResult(null);
    if (!inviteForm.email || !inviteForm.roleId) {
      setError('Email and role are required.');
      return;
    }
    setInviting(true);
    try {
      const { data } = await api.post('/organizations/invite', inviteForm);
      setInviteResult(data.data);
      setInviteForm({ email: '', roleId: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send invite.');
    } finally { setInviting(false); }
  };

  const revokeInvitation = async (id) => {
    try {
      await api.delete(`/organizations/invitations/${id}`);
      fetchData();
    } catch (err) { alert(err.response?.data?.message || 'Failed to revoke.'); }
  };

  const deactivateMember = async (id) => {
    if (!confirm('Deactivate this member?')) return;
    try {
      await api.put(`/organizations/members/${id}/deactivate`);
      fetchData();
    } catch (err) { alert(err.response?.data?.message || 'Failed.'); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Invite Section */}
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255, 255, 255, 0.72)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.35)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
      }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Team Members</h3>
          <button onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors">
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        </div>

        {showInvite && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50/50 border border-gray-100">
            <form onSubmit={handleInvite} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={inviteForm.email}
                  onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="user@company.com"
                  className="w-full px-3 py-2 rounded-lg text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <div className="w-48">
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={inviteForm.roleId}
                  onChange={e => setInviteForm(p => ({ ...p, roleId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400">
                  <option value="">Select role...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={inviting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-500 hover:bg-green-600 disabled:opacity-50">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Invite'}
              </button>
            </form>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            {inviteResult && (
              <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-100">
                <p className="text-xs text-green-700 font-medium">Invitation sent to {inviteResult.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <input readOnly value={inviteResult.inviteUrl || ''} className="flex-1 text-xs px-2 py-1 rounded bg-white border border-green-200" />
                  <button onClick={() => navigator.clipboard.writeText(inviteResult.inviteUrl)}
                    className="p-1 text-green-600 hover:text-green-700">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Members list */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50">
                  <td className="py-3 font-medium text-gray-800">{m.fullName}</td>
                  <td className="py-3 text-gray-500">{m.email}</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">{m.role}</span>
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    {m.isActive && (
                      <button onClick={() => deactivateMember(m.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.filter(i => i.status === 'pending').length > 0 && (
        <div className="rounded-2xl p-6" style={{
          background: 'rgba(255, 255, 255, 0.72)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.35)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
        }}>
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-amber-500" />
            Pending Invitations
          </h3>
          <div className="space-y-2">
            {invitations.filter(i => i.status === 'pending').map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">{inv.email}</p>
                  <p className="text-xs text-gray-400">Role: {inv.role} &middot; Invited by {inv.invitedByName}</p>
                </div>
                <button onClick={() => revokeInvitation(inv.id)}
                  className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Keys Settings Tab
// ---------------------------------------------------------------------------
function AIKeysSettings() {
  const [keys, setKeys] = useState({ anthropicApiKey: '', openaiApiKey: '', geminiApiKey: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const payload = {};
      if (keys.anthropicApiKey) payload.anthropicApiKey = keys.anthropicApiKey;
      if (keys.openaiApiKey) payload.openaiApiKey = keys.openaiApiKey;
      if (keys.geminiApiKey) payload.geminiApiKey = keys.geminiApiKey;

      if (Object.keys(payload).length === 0) {
        setMsg('Enter at least one API key to save.');
        setSaving(false);
        return;
      }

      await api.put('/organizations/ai-keys', payload);
      setMsg('AI keys saved successfully.');
      setKeys({ anthropicApiKey: '', openaiApiKey: '', geminiApiKey: '' });
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to save keys.');
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl p-6 max-w-2xl" style={{
      background: 'rgba(255, 255, 255, 0.72)', backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.35)', boxShadow: '0 4px 30px rgba(0,0,0,0.04)',
    }}>
      <h3 className="text-lg font-bold text-gray-800 mb-1">AI API Keys</h3>
      <p className="text-sm text-gray-500 mb-6">
        Provide your own API keys for AI-powered features. Keys are encrypted at rest.
        All plans have access to all AI models.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Anthropic API Key</label>
          <input type="password" value={keys.anthropicApiKey}
            onChange={e => setKeys(p => ({ ...p, anthropicApiKey: e.target.value }))}
            placeholder="sk-ant-..."
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
          <input type="password" value={keys.openaiApiKey}
            onChange={e => setKeys(p => ({ ...p, openaiApiKey: e.target.value }))}
            placeholder="sk-..."
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Google Gemini API Key</label>
          <input type="password" value={keys.geminiApiKey}
            onChange={e => setKeys(p => ({ ...p, geminiApiKey: e.target.value }))}
            placeholder="AIza..."
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>

        {msg && (
          <div className={`flex items-center gap-2 text-sm ${msg.includes('Failed') || msg.includes('Enter') ? 'text-red-600' : 'text-green-600'}`}>
            {msg.includes('Failed') || msg.includes('Enter') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {msg}
          </div>
        )}

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          Save API Keys
        </button>
      </form>
    </div>
  );
}
