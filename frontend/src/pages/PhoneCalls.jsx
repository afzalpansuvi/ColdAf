import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { format } from 'date-fns';
import {
  Loader2,
  AlertTriangle,
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Play,
  Save,
  Shield,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Settings2,
  RefreshCw,
  BarChart3,
  ChevronDown,
  ChevronRight,
  X,
  ExternalLink,
  Search,
  Headphones,
  Volume2,
  BookOpen,
  FileText,
  MessageSquare,
  Plus,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

// ── Status config ───────────────────────────────────────────────────

const CALL_STATUS_CONFIG = {
  queued:        { color: 'bg-gray-400',   textColor: 'text-gray-700',   bgColor: 'bg-gray-100',   label: 'Queued',      icon: Clock },
  initiated:     { color: 'bg-blue-400',   textColor: 'text-blue-700',   bgColor: 'bg-blue-100',   label: 'Initiated',   icon: Phone },
  ringing:       { color: 'bg-indigo-400', textColor: 'text-indigo-700', bgColor: 'bg-indigo-100', label: 'Ringing',     icon: PhoneCall },
  'in-progress': { color: 'bg-yellow-400', textColor: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'In Progress', icon: PhoneCall },
  completed:     { color: 'bg-green-500',  textColor: 'text-green-700',  bgColor: 'bg-green-100',  label: 'Completed',   icon: CheckCircle },
  failed:        { color: 'bg-red-500',    textColor: 'text-red-700',    bgColor: 'bg-red-100',    label: 'Failed',      icon: XCircle },
  'no-answer':   { color: 'bg-orange-400', textColor: 'text-orange-700', bgColor: 'bg-orange-100', label: 'No Answer',   icon: PhoneMissed },
  busy:          { color: 'bg-orange-500', textColor: 'text-orange-700', bgColor: 'bg-orange-100', label: 'Busy',        icon: PhoneOff },
  cancelled:     { color: 'bg-gray-500',   textColor: 'text-gray-600',   bgColor: 'bg-gray-100',   label: 'Cancelled',   icon: XCircle },
};

function CallStatusBadge({ status }) {
  const config = CALL_STATUS_CONFIG[status] || CALL_STATUS_CONFIG.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {config.label}
    </span>
  );
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Demo / mock data (used when backend is not available) ───────────

const DEMO_CALLS = [
  {
    id: 'demo-1', lead_name: 'Marcus Johnson', lead_email: 'marcus@techcorp.io', phone_number: '+14155551234',
    status: 'completed', duration_seconds: 187, created_at: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(), ended_at: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    summary: 'Lead expressed strong interest in website redesign package. Wants a follow-up email with pricing for a 10-page corporate site. Budget range: $8k-$12k.',
    ended_reason: 'customer-ended-call', vapi_call_id: 'vapi_abc123def456',
    transcript: 'AI: Hi, may I speak with Marcus?\nMarcus: Yes, this is Marcus.\nAI: Hi Marcus! I\'m calling from our team regarding your inquiry about web development services. I understand you were looking for help with a corporate website redesign. Is now a good time to chat?\nMarcus: Yeah, sure. I\'ve been looking for someone to redo our company site.\nAI: That\'s great to hear! Could you tell me a bit more about what you\'re envisioning?\nMarcus: We need about 10 pages, modern design, mobile-friendly. Our current site is pretty outdated.\nAI: Absolutely, we specialize in exactly that kind of work. What\'s your budget range for this project?\nMarcus: We\'re thinking somewhere between 8 and 12 thousand.\nAI: Perfect, that\'s well within range for a 10-page corporate redesign. Would you like me to send over a detailed proposal with our pricing options?\nMarcus: Yes, please send it to my email.\nAI: Wonderful! I\'ll have that over to you within 24 hours. Thank you for your time, Marcus!',
  },
  {
    id: 'demo-2', lead_name: 'Sarah Chen', lead_email: 'sarah@startupxyz.com', phone_number: '+12125559876',
    status: 'completed', duration_seconds: 243, created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 49).toISOString(), ended_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    summary: 'Lead is a startup founder looking for a full-stack developer for MVP. Very interested. Scheduled a Zoom call for Thursday 3 PM.',
    ended_reason: 'customer-ended-call', vapi_call_id: 'vapi_ghi789jkl012',
    transcript: 'AI: Hi, may I speak with Sarah?\nSarah: Speaking.\nAI: Hi Sarah, I\'m reaching out from our team. I understand you posted on Discord about needing development help for your startup.\nSarah: Yes! We\'re building a SaaS product and need help with the MVP.\nAI: That sounds exciting! Can you tell me more about the tech stack you\'re considering?\nSarah: We\'re thinking React and Node.js with PostgreSQL.\nAI: Great choices. We have extensive experience with that exact stack. Would you be open to scheduling a more detailed call to discuss the project scope?\nSarah: Absolutely. How about Thursday at 3 PM?\nAI: Thursday at 3 PM works perfectly. I\'ll send you a Zoom link. Looking forward to it!\nSarah: Great, talk then!',
  },
  {
    id: 'demo-3', lead_name: 'Alex Rivera', lead_email: 'alex@designstudio.co', phone_number: '+13105557890',
    status: 'no-answer', duration_seconds: null, created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(), ended_at: null,
    summary: null, ended_reason: 'no-answer', vapi_call_id: 'vapi_mno345pqr678',
  },
  {
    id: 'demo-4', lead_name: 'Priya Patel', lead_email: 'priya@ecommhub.com', phone_number: '+14085553456',
    status: 'completed', duration_seconds: 152, created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 123).toISOString(), ended_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    summary: 'Lead needs an e-commerce platform migration from WooCommerce to Shopify. Asked to send portfolio examples of previous Shopify builds. Warm lead.',
    ended_reason: 'customer-ended-call', vapi_call_id: 'vapi_stu901vwx234',
    transcript: 'AI: Hi, is this Priya?\nPriya: Yes, hi!\nAI: Hi Priya! I\'m calling about your inquiry for e-commerce development services.\nPriya: Oh yes, we need to move our store from WooCommerce to Shopify. It\'s becoming too hard to manage.\nAI: We\'ve done several WooCommerce to Shopify migrations. How many products do you currently have?\nPriya: About 500 products with various variants.\nAI: That\'s very manageable. We can typically complete a migration like that in 3-4 weeks. Would you like me to send some examples of our previous Shopify work?\nPriya: That would be great, send them over!',
  },
  {
    id: 'demo-5', lead_name: 'Jordan Williams', lead_email: 'jordan@blocktechvc.io', phone_number: '+16505558901',
    status: 'in-progress', duration_seconds: null, created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(), ended_at: null,
    summary: null, ended_reason: null, vapi_call_id: 'vapi_yza567bcd890',
  },
  {
    id: 'demo-6', lead_name: 'Emily Foster', lead_email: 'emily@creativeagency.net', phone_number: '+17735554321',
    status: 'failed', duration_seconds: null, created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    initiated_at: null, ended_at: null,
    summary: null, ended_reason: null, vapi_call_id: null,
    error_message: 'Vapi API error: Phone number +17735554321 is not in E.164 format or is unreachable.',
  },
  {
    id: 'demo-7', lead_name: 'David Kim', lead_email: 'david@kimconsulting.com', phone_number: '+19175556789',
    status: 'completed', duration_seconds: 94, created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 242).toISOString(), ended_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    summary: 'Lead is interested but needs to check with business partner first. Will get back to us by end of week. Warm lead — follow up Friday.',
    ended_reason: 'customer-ended-call', vapi_call_id: 'vapi_efg123hij456',
  },
  {
    id: 'demo-8', lead_name: 'Rachel Thompson', lead_email: 'rachel@fitnessbrand.com', phone_number: '+12065552345',
    status: 'busy', duration_seconds: null, created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(), ended_at: null,
    summary: null, ended_reason: 'busy', vapi_call_id: 'vapi_klm789nop012',
  },
  {
    id: 'demo-9', lead_name: 'Tom Nakamura', lead_email: 'tom@nakamuradev.jp', phone_number: '+18185559012',
    status: 'completed', duration_seconds: 312, created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 366).toISOString(), ended_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    summary: 'High-value lead. Needs a full mobile app (iOS + Android) for a restaurant chain. Budget $25k-$40k. Requested a formal proposal and in-person meeting.',
    ended_reason: 'customer-ended-call', vapi_call_id: 'vapi_qrs345tuv678',
    transcript: 'AI: Hi, may I speak with Tom?\nTom: This is Tom, who\'s calling?\nAI: Hi Tom, I\'m reaching out from our development team. You mentioned on Discord that you\'re looking for mobile app development.\nTom: Yeah, I run a chain of 12 restaurants and we need a customer-facing app for ordering and loyalty rewards.\nAI: That sounds like a fantastic project. Are you looking for both iOS and Android?\nTom: Yes, both platforms. We want it to feel premium — our brand is upscale casual.\nAI: We\'ve built several restaurant apps with ordering and loyalty features. What\'s your timeline looking like?\nTom: We\'d like to launch in about 4-5 months.\nAI: That\'s doable. What budget range are you working with?\nTom: Between $25,000 and $40,000 depending on the features.\nAI: Perfect. Would you be open to an in-person meeting to go over the full scope?\nTom: Absolutely. Send me some times that work for your team.\nAI: Will do! I\'ll send a formal proposal along with meeting options. Thank you, Tom!',
  },
  {
    id: 'demo-10', lead_name: 'Lisa Hernandez', lead_email: 'lisa@greenleaforg.org', phone_number: '+15125557654',
    status: 'queued', duration_seconds: null, created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    initiated_at: null, ended_at: null,
    summary: null, ended_reason: null, vapi_call_id: null,
  },
  {
    id: 'demo-11', lead_name: 'Omar Hassan', lead_email: 'omar@fintechstartup.io', phone_number: '+14695551122',
    status: 'ringing', duration_seconds: null, created_at: new Date(Date.now() - 1000 * 60).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 30).toISOString(), ended_at: null,
    summary: null, ended_reason: null, vapi_call_id: 'vapi_wxy901zab234',
  },
  {
    id: 'demo-12', lead_name: 'Megan Scott', lead_email: 'megan@mediaco.com', phone_number: '+13035558899',
    status: 'completed', duration_seconds: 68, created_at: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    initiated_at: new Date(Date.now() - 1000 * 60 * 421).toISOString(), ended_at: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    summary: 'Lead was polite but not interested at this time. Said they may revisit in Q3. Cold lead — archive.',
    ended_reason: 'customer-ended-call', vapi_call_id: 'vapi_cde567fgh890',
  },
];

const DEMO_STATS = {
  total_calls: 47,
  completed: 28,
  failed: 4,
  no_answer: 7,
  busy: 3,
  in_flight: 5,
  avg_duration_seconds: 164,
  calls_today: 8,
};

const DEMO_AGENT_SETTINGS = {
  vapi_call_enabled: 'true',
  vapi_call_source_filter: 'discord',
  vapi_max_retries: '2',
  vapi_schedule_interval_minutes: '30',
  vapi_retry_on_no_answer: 'true',
  vapi_agent_last_run_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
};

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function PhoneCalls() {
  const { isAdmin } = useAuth();

  // Data
  const [calls, setCalls] = useState([]);
  const [stats, setStats] = useState(null);
  const [agentSettings, setAgentSettings] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Settings form
  const [settingsForm, setSettingsForm] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);

  // Actions
  const [triggering, setTriggering] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Detail modal
  const [selectedCall, setSelectedCall] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [callDetail, setCallDetail] = useState(null);

  // Demo mode flag
  const [demoMode, setDemoMode] = useState(false);

  // Call script
  const [callScript, setCallScript] = useState({ vapi_custom_first_message: '', vapi_system_prompt: '', vapi_knowledge_enabled: 'true' });
  const [savingScript, setSavingScript] = useState(false);
  const [showScriptSection, setShowScriptSection] = useState(false);

  // Knowledge base
  const [knowledgeEntries, setKnowledgeEntries] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [showKnowledgeSection, setShowKnowledgeSection] = useState(false);
  const [knowledgeForm, setKnowledgeForm] = useState({ title: '', content: '' });
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Fetch data (with demo fallback) ───────────────────────────────

  const fetchCalls = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, limit: 25 });
      if (statusFilter) params.append('status', statusFilter);
      const res = await api.get(`/phone-calls?${params}`);
      const d = res.data || res;
      setCalls(d.calls || []);
      setTotal(d.total || 0);
    } catch (_) {
      // Fallback to demo data
      let filtered = DEMO_CALLS;
      if (statusFilter) filtered = filtered.filter(c => c.status === statusFilter);
      setCalls(filtered);
      setTotal(filtered.length);
      setDemoMode(true);
    }
  }, [page, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/phone-calls/stats');
      setStats(res.data || res);
    } catch (_) {
      setStats(DEMO_STATS);
      setDemoMode(true);
    }
  }, []);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const res = await api.get('/phone-calls/agent/status');
      const d = res.data || res;
      setAgentSettings(d);
      setSettingsForm({
        vapi_call_enabled: d.vapi_call_enabled === 'true' || d.vapi_call_enabled === true,
        vapi_call_source_filter: d.vapi_call_source_filter || 'discord',
        vapi_max_retries: parseInt(d.vapi_max_retries, 10) || 1,
        vapi_schedule_interval_minutes: parseInt(d.vapi_schedule_interval_minutes, 10) || 30,
        vapi_retry_on_no_answer: d.vapi_retry_on_no_answer === 'true' || d.vapi_retry_on_no_answer === true,
      });
    } catch (_) {
      const d = DEMO_AGENT_SETTINGS;
      setAgentSettings(d);
      setSettingsForm({
        vapi_call_enabled: true,
        vapi_call_source_filter: d.vapi_call_source_filter,
        vapi_max_retries: parseInt(d.vapi_max_retries, 10),
        vapi_schedule_interval_minutes: parseInt(d.vapi_schedule_interval_minutes, 10),
        vapi_retry_on_no_answer: true,
      });
      setDemoMode(true);
    }
  }, []);

  const fetchCallScript = useCallback(async () => {
    try {
      const res = await api.get('/phone-calls/agent/call-script');
      const d = res.data || res;
      setCallScript({
        vapi_custom_first_message: d.vapi_custom_first_message || '',
        vapi_system_prompt: d.vapi_system_prompt || '',
        vapi_knowledge_enabled: d.vapi_knowledge_enabled ?? 'true',
      });
    } catch (_) {
      // non-critical
    }
  }, []);

  const fetchKnowledge = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const res = await api.get('/phone-calls/knowledge');
      setKnowledgeEntries(res.data || []);
    } catch (_) {
      // non-critical
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchCalls(), fetchStats(), fetchAgentStatus(), fetchCallScript(), fetchKnowledge()]);
    setLoading(false);
  }, [fetchCalls, fetchStats, fetchAgentStatus, fetchCallScript, fetchKnowledge]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Actions ───────────────────────────────────────────────────────

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      if (demoMode) {
        await new Promise(r => setTimeout(r, 1200));
        setToast({ type: 'success', message: 'Demo: Agent scan complete. Initiated: 3, Errors: 0' });
      } else {
        const res = await api.post('/phone-calls/trigger');
        const d = res.data || res;
        setToast({
          type: 'success',
          message: `Agent scan complete. Initiated: ${d.initiated || 0}, Errors: ${d.errors || 0}`,
        });
        await fetchCalls();
        await fetchStats();
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Trigger failed.' });
    } finally {
      setTriggering(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (demoMode) {
        await new Promise(r => setTimeout(r, 800));
        setToast({ type: 'success', message: 'Demo: Synced 5 call(s) from Vapi.' });
      } else {
        const res = await api.post('/phone-calls/sync');
        const d = res.data || res;
        setToast({
          type: 'success',
          message: `Synced ${d.synced || 0} call(s) from Vapi.`,
        });
        await fetchCalls();
        await fetchStats();
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Sync failed.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleEnabled = async () => {
    const newVal = !settingsForm.vapi_call_enabled;
    setSettingsForm(prev => ({ ...prev, vapi_call_enabled: newVal }));
    if (demoMode) {
      setToast({ type: 'success', message: newVal ? 'Demo: Phone Call Agent enabled.' : 'Demo: Phone Call Agent disabled.' });
      return;
    }
    try {
      await api.put('/phone-calls/agent/settings', { vapi_call_enabled: newVal });
      setToast({ type: 'success', message: newVal ? 'Phone Call Agent enabled.' : 'Phone Call Agent disabled.' });
      await fetchAgentStatus();
    } catch (err) {
      setSettingsForm(prev => ({ ...prev, vapi_call_enabled: !newVal }));
      setToast({ type: 'error', message: err.message || 'Failed to toggle agent.' });
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      if (demoMode) {
        await new Promise(r => setTimeout(r, 600));
        setToast({ type: 'success', message: 'Demo: Phone Call Agent settings saved.' });
      } else {
        await api.put('/phone-calls/agent/settings', settingsForm);
        setToast({ type: 'success', message: 'Phone Call Agent settings saved.' });
        await fetchAgentStatus();
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Call script handlers ──────────────────────────────────────────

  const handleSaveCallScript = async () => {
    setSavingScript(true);
    try {
      await api.put('/phone-calls/agent/call-script', callScript);
      setToast({ type: 'success', message: 'Call script saved.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save call script.' });
    } finally {
      setSavingScript(false);
    }
  };

  // ── Knowledge base handlers ─────────────────────────────────────

  const handleSaveKnowledge = async () => {
    setSavingKnowledge(true);
    try {
      if (editingEntryId) {
        await api.put(`/phone-calls/knowledge/${editingEntryId}`, knowledgeForm);
        setToast({ type: 'success', message: 'Knowledge entry updated.' });
      } else {
        await api.post('/phone-calls/knowledge', knowledgeForm);
        setToast({ type: 'success', message: 'Knowledge entry created.' });
      }
      setKnowledgeForm({ title: '', content: '' });
      setEditingEntryId(null);
      setShowKnowledgeForm(false);
      fetchKnowledge();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save knowledge entry.' });
    } finally {
      setSavingKnowledge(false);
    }
  };

  const handleEditKnowledge = (entry) => {
    setKnowledgeForm({ title: entry.title, content: entry.content });
    setEditingEntryId(entry.id);
    setShowKnowledgeForm(true);
  };

  const handleDeleteKnowledge = async (id) => {
    try {
      await api.delete(`/phone-calls/knowledge/${id}`);
      setToast({ type: 'success', message: 'Knowledge entry deleted.' });
      fetchKnowledge();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to delete knowledge entry.' });
    }
  };

  const handleToggleKnowledge = async (entry) => {
    try {
      await api.put(`/phone-calls/knowledge/${entry.id}`, { is_active: !entry.is_active });
      fetchKnowledge();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to toggle knowledge entry.' });
    }
  };

  const handleToggleKnowledgeEnabled = async () => {
    const newVal = callScript.vapi_knowledge_enabled === 'true' || callScript.vapi_knowledge_enabled === true ? 'false' : 'true';
    try {
      await api.put('/phone-calls/agent/call-script', { vapi_knowledge_enabled: newVal });
      setCallScript(prev => ({ ...prev, vapi_knowledge_enabled: newVal }));
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to toggle knowledge base.' });
    }
  };

  // ── Call detail ───────────────────────────────────────────────────

  const openCallDetail = async (callId) => {
    setSelectedCall(callId);
    setDetailLoading(true);
    setCallDetail(null);
    try {
      if (demoMode) {
        await new Promise(r => setTimeout(r, 300));
        const found = DEMO_CALLS.find(c => c.id === callId);
        setCallDetail(found || null);
        if (!found) setSelectedCall(null);
      } else {
        const res = await api.get(`/phone-calls/${callId}`);
        setCallDetail(res.data || res);
      }
    } catch (err) {
      // Try demo fallback
      const found = DEMO_CALLS.find(c => c.id === callId);
      if (found) {
        setCallDetail(found);
      } else {
        setToast({ type: 'error', message: 'Failed to load call details.' });
        setSelectedCall(null);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Guards & loading ──────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Admin access required to manage Phone Calls.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading Phone Calls...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / 25) || 1;
  const isEnabled = settingsForm.vapi_call_enabled;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Phone Call Agent</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-powered outbound phone calls to Discord leads via Vapi.ai
        </p>
      </div>

      {/* Demo mode banner */}
      {demoMode && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm border bg-indigo-50 border-indigo-200 text-indigo-700">
          <Phone className="w-5 h-5 text-indigo-500 flex-shrink-0" />
          <span><strong>Demo Mode</strong> — Backend is not connected. Showing sample data so you can preview the full UI.</span>
        </div>
      )}

      {/* Toast */}
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* ── Stats Cards ──────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Calls" value={stats.total_calls} icon={Phone} color="blue" />
          <StatCard label="Completed" value={stats.completed} icon={CheckCircle} color="green" />
          <StatCard label="Failed" value={stats.failed} icon={XCircle} color="red" />
          <StatCard label="No Answer" value={stats.no_answer} icon={PhoneMissed} color="orange" />
          <StatCard label="In Flight" value={stats.in_flight} icon={PhoneCall} color="indigo" />
          <StatCard label="Avg Duration" value={formatDuration(stats.avg_duration_seconds)} icon={Clock} color="purple" isText />
        </div>
      )}

      {/* ── Agent Status Card ────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Status indicator */}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              isEnabled ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <Phone className={`w-8 h-8 ${
                isEnabled ? 'text-green-600' : 'text-gray-400'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {isEnabled ? 'Active' : 'Disabled'}
                </h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  isEnabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    isEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                  }`} />
                  {isEnabled ? 'Running' : 'Stopped'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Source filter: <span className="font-mono text-gray-700">{settingsForm.vapi_call_source_filter || 'discord'}</span>
              </p>
            </div>
          </div>

          {/* Status details */}
          <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Last Run</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {agentSettings.vapi_agent_last_run_at && agentSettings.vapi_agent_last_run_at !== 'null'
                  ? format(new Date(agentSettings.vapi_agent_last_run_at), 'MMM d, HH:mm')
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Scan Interval</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Every {settingsForm.vapi_schedule_interval_minutes || 30} min
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Calls Today</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {stats?.calls_today || 0}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="btn-primary flex items-center gap-2"
            >
              {triggering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {triggering ? 'Scanning...' : 'Scan Now'}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-secondary flex items-center gap-2"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sync Vapi
            </button>
            <button
              onClick={handleToggleEnabled}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                isEnabled
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {isEnabled ? (
                <>
                  <XCircle className="w-4 h-4" />
                  Disable
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Enable
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Settings Card ────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Settings2 className="w-5 h-5 text-brand-600" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Agent Settings</h2>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Source Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Search className="w-3.5 h-3.5 inline mr-1" />
                Source Filter
              </label>
              <input
                type="text"
                value={settingsForm.vapi_call_source_filter || ''}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, vapi_call_source_filter: e.target.value }))}
                placeholder="discord"
                className="input-field"
              />
              <p className="text-[10px] text-gray-400 mt-1">Match webhook source name</p>
            </div>

            {/* Scan Interval */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                Scan Interval (min)
              </label>
              <input
                type="number"
                value={settingsForm.vapi_schedule_interval_minutes || 30}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, vapi_schedule_interval_minutes: parseInt(e.target.value, 10) || 30 }))}
                min={5}
                max={1440}
                className="input-field"
              />
            </div>

            {/* Max Retries */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Retries
              </label>
              <input
                type="number"
                value={settingsForm.vapi_max_retries || 1}
                onChange={(e) => setSettingsForm(prev => ({ ...prev, vapi_max_retries: parseInt(e.target.value, 10) || 0 }))}
                min={0}
                max={5}
                className="input-field"
              />
            </div>

            {/* Retry on no answer toggle */}
            <div className="flex items-center gap-3 pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsForm.vapi_retry_on_no_answer || false}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, vapi_retry_on_no_answer: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Retry No-Answer</span>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="btn-primary flex items-center gap-2"
            >
              {savingSettings ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Call Script Card ────────────────────────────────────── */}
      <div className="card">
        <button
          onClick={() => setShowScriptSection(!showScriptSection)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Call Script</h2>
          </div>
          {showScriptSection ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>

        {showScriptSection && (
          <div className="mt-5 space-y-5">
            {/* First Message Template */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Message Template
              </label>
              <textarea
                rows={3}
                value={callScript.vapi_custom_first_message || ''}
                onChange={(e) => setCallScript(prev => ({ ...prev, vapi_custom_first_message: e.target.value }))}
                placeholder="Hi, may I speak with {{leadName}}? I'm calling regarding your inquiry about {{projectDetails}}."
                className="input-field font-mono text-sm"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Available variables: <code className="bg-gray-100 px-1 rounded">{'{{leadName}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{projectDetails}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{industry}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{email}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{phone}}'}</code>
              </p>
            </div>

            {/* System Prompt / Call Script */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt / Call Instructions
              </label>
              <textarea
                rows={8}
                value={callScript.vapi_system_prompt || ''}
                onChange={(e) => setCallScript(prev => ({ ...prev, vapi_system_prompt: e.target.value }))}
                placeholder={"You are a friendly sales assistant calling leads who expressed interest via Discord.\n\nGuidelines:\n- Be professional and concise\n- Identify their needs and budget\n- Schedule a follow-up meeting if interested\n- If not interested, thank them politely"}
                className="input-field font-mono text-sm"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Instructions for the AI calling agent. This is sent as the system prompt to the Vapi assistant. Leave empty to use the default assistant behavior.
              </p>
            </div>

            {/* Preview */}
            {callScript.vapi_custom_first_message && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-semibold">Preview (sample lead)</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                  {callScript.vapi_custom_first_message
                    .replace(/\{\{leadName\}\}/g, 'Marcus Johnson')
                    .replace(/\{\{projectDetails\}\}/g, 'a corporate website redesign')
                    .replace(/\{\{industry\}\}/g, 'Technology')
                    .replace(/\{\{email\}\}/g, 'marcus@techcorp.io')
                    .replace(/\{\{phone\}\}/g, '+14155551234')
                  }
                </p>
              </div>
            )}

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveCallScript}
                disabled={savingScript}
                className="btn-primary flex items-center gap-2"
              >
                {savingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingScript ? 'Saving...' : 'Save Call Script'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Knowledge Base Card ──────────────────────────────────── */}
      <div className="card">
        <button
          onClick={() => setShowKnowledgeSection(!showKnowledgeSection)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Knowledge Base</h2>
            <span className="text-xs text-gray-400">({knowledgeEntries.length} entries)</span>
          </div>
          {showKnowledgeSection ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>

        {showKnowledgeSection && (
          <div className="mt-5 space-y-4">
            {/* Knowledge enabled toggle + Add button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={handleToggleKnowledgeEnabled} className="flex items-center gap-2 text-sm">
                  {callScript.vapi_knowledge_enabled === 'true' || callScript.vapi_knowledge_enabled === true ? (
                    <ToggleRight className="w-6 h-6 text-brand-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                  )}
                  <span className="text-gray-700 dark:text-gray-300">
                    {callScript.vapi_knowledge_enabled === 'true' || callScript.vapi_knowledge_enabled === true ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              </div>
              <button
                onClick={() => { setKnowledgeForm({ title: '', content: '' }); setEditingEntryId(null); setShowKnowledgeForm(true); }}
                className="btn-primary btn-sm flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Entry
              </button>
            </div>

            <p className="text-[10px] text-gray-400">
              Knowledge entries are injected into the AI assistant's context during calls. Add FAQs, product info, pricing, or company details.
            </p>

            {/* Add/Edit form */}
            {showKnowledgeForm && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title / Topic</label>
                  <input
                    type="text"
                    value={knowledgeForm.title}
                    onChange={(e) => setKnowledgeForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Pricing, Company Info, Common Questions"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
                  <textarea
                    rows={4}
                    value={knowledgeForm.content}
                    onChange={(e) => setKnowledgeForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Enter the knowledge content that the AI agent should know about..."
                    className="input-field text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveKnowledge}
                    disabled={savingKnowledge || !knowledgeForm.title.trim() || !knowledgeForm.content.trim()}
                    className="btn-primary btn-sm flex items-center gap-1.5"
                  >
                    {savingKnowledge ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    {editingEntryId ? 'Update' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setShowKnowledgeForm(false); setEditingEntryId(null); setKnowledgeForm({ title: '', content: '' }); }}
                    className="btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Knowledge entries list */}
            {knowledgeLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
              </div>
            ) : knowledgeEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No knowledge entries yet. Add your first entry above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {knowledgeEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-lg border p-3 ${
                      entry.is_active
                        ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{entry.title}</h4>
                          {!entry.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">Inactive</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{entry.content}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleKnowledge(entry)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 rounded"
                          title={entry.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {entry.is_active ? <ToggleRight className="w-4 h-4 text-brand-600" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEditKnowledge(entry)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 rounded"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteKnowledge(entry.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Call Log ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Call Log</h2>
            <span className="text-xs text-gray-400">({total} total)</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="select-field text-xs !pr-7 !py-1.5"
              >
                <option value="">All Statuses</option>
                {Object.entries(CALL_STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>

            <button
              onClick={() => { fetchCalls(); fetchStats(); }}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Phone className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No calls yet</p>
            <p className="text-xs mt-1">Run Scan Now to process new Discord leads.</p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 pr-4">Lead</th>
                    <th className="pb-3 pr-4">Phone</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Duration</th>
                    <th className="pb-3 pr-4">Summary</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody className=" dark:divide-gray-800">
                  {calls.map((call) => (
                    <tr
                      key={call.id}
                      className="hover:bg-brand-50/30 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                      onClick={() => openCallDetail(call.id)}
                    >
                      <td className="py-3 pr-4 whitespace-nowrap text-gray-500 tabular-nums">
                        {call.created_at
                          ? format(new Date(call.created_at), 'MMM d, HH:mm')
                          : '--'}
                      </td>
                      <td className="py-3 pr-4">
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100 truncate max-w-[160px]">
                            {call.lead_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-400 truncate max-w-[160px]">
                            {call.lead_email || ''}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 font-mono text-xs whitespace-nowrap">
                        {call.phone_number || '--'}
                      </td>
                      <td className="py-3 pr-4">
                        <CallStatusBadge status={call.status} />
                      </td>
                      <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="py-3 pr-4 max-w-[200px]">
                        <p className="text-gray-500 text-xs truncate">
                          {call.summary || call.ended_reason || '--'}
                        </p>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); openCallDetail(call.id); }}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500">
                  Page {page} of {totalPages} ({total} calls)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn-secondary btn-sm disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="btn-secondary btn-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Call Detail Modal ──────────────────────────────────────── */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedCall(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
              </div>
            ) : callDetail ? (
              <div className="p-6 space-y-5">
                {/* Modal header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Call Details</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {callDetail.lead_name} — {callDetail.phone_number}
                    </p>
                  </div>
                  <button onClick={() => setSelectedCall(null)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Status + meta */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Status</p>
                    <CallStatusBadge status={callDetail.status} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Duration</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{formatDuration(callDetail.duration_seconds)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Initiated</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {callDetail.initiated_at
                        ? format(new Date(callDetail.initiated_at), 'MMM d, HH:mm:ss')
                        : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Ended</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {callDetail.ended_at
                        ? format(new Date(callDetail.ended_at), 'MMM d, HH:mm:ss')
                        : '--'}
                    </p>
                  </div>
                </div>

                {/* End reason */}
                {callDetail.ended_reason && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">End Reason</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{callDetail.ended_reason}</p>
                  </div>
                )}

                {/* Error */}
                {callDetail.error_message && (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1">Error</p>
                    <p className="text-sm text-red-700">{callDetail.error_message}</p>
                  </div>
                )}

                {/* Summary */}
                {callDetail.summary && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">AI Summary</p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">{callDetail.summary}</p>
                    </div>
                  </div>
                )}

                {/* Recording */}
                {callDetail.recording_url && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recording</p>
                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <Volume2 className="w-5 h-5 text-brand-600 flex-shrink-0" />
                      <audio controls className="flex-1 max-w-full h-8" src={callDetail.recording_url}>
                        Your browser does not support audio playback.
                      </audio>
                      <a
                        href={callDetail.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:text-brand-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Transcript */}
                {callDetail.transcript && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Transcript</p>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-60 overflow-y-auto">
                      <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {callDetail.transcript}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Vapi ID */}
                {callDetail.vapi_call_id && (
                  <div className="text-xs text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700 font-mono">
                    Vapi ID: {callDetail.vapi_call_id}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <p>Could not load call details.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat Card Component ─────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, isText = false }) {
  const colorMap = {
    blue:   'bg-blue-100 text-blue-600',
    green:  'bg-green-100 text-green-600',
    red:    'bg-red-100 text-red-600',
    orange: 'bg-orange-100 text-orange-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="card !p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {isText ? value : (value ?? 0).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
