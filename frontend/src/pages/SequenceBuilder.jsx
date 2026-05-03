import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle,
  GitBranch,
  Clock,
  Mail,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_OPTIONS = [
  { value: 'no_action', label: 'No action (no open or reply)' },
  { value: 'opened', label: 'Opened email' },
  { value: 'not_opened', label: 'Did not open' },
  { value: 'clicked', label: 'Clicked a link' },
  { value: 'not_clicked', label: 'Did not click' },
  { value: 'replied', label: 'Replied' },
  { value: 'not_replied', label: 'Did not reply' },
  { value: 'start', label: 'Always (first step)' },
];

const STEP_TYPE_OPTIONS = [
  { value: 'email', label: 'Send Email' },
  { value: 'condition', label: 'Condition Branch' },
  { value: 'wait', label: 'Wait / Delay' },
];

const DEFAULT_STEP = {
  stepOrder: 0,
  stepType: 'email',
  conditionType: 'no_action',
  conditionValue: '',
  delayDays: 0,
  delayHours: 24,
  subjectOverride: '',
  branchLabel: '',
  isActive: true,
};

// ---------------------------------------------------------------------------
// Step icon helper
// ---------------------------------------------------------------------------

function StepIcon({ stepType }) {
  if (stepType === 'condition') return <GitBranch className="w-4 h-4 text-purple-600" />;
  if (stepType === 'wait') return <Clock className="w-4 h-4 text-amber-500" />;
  return <Mail className="w-4 h-4 text-indigo-600" />;
}

// ---------------------------------------------------------------------------
// SequenceBuilder
// ---------------------------------------------------------------------------

export default function SequenceBuilder() {
  const { id: campaignId } = useParams();

  const [campaign, setCampaign] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // ── Load campaign name and existing steps ─────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignRes, stepsRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/sequence`),
      ]);

      setCampaign(campaignRes.data || campaignRes);

      const rawSteps = (stepsRes.data || stepsRes || []);
      if (rawSteps.length > 0) {
        setSteps(rawSteps.map(dbRowToFormStep));
      } else {
        // Provide a default first step
        setSteps([{ ...DEFAULT_STEP, stepOrder: 0, conditionType: 'start' }]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load sequence data.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── DB row -> form shape ──────────────────────────────────────────────────
  function dbRowToFormStep(row) {
    return {
      id: row.id,
      stepOrder: row.step_order ?? row.stepOrder ?? 0,
      stepType: row.step_type || row.stepType || 'email',
      conditionType: row.condition_type || row.conditionType || 'no_action',
      conditionValue: row.condition_value || row.conditionValue || '',
      delayDays: row.delay_days ?? row.delayDays ?? 0,
      delayHours: row.delay_hours ?? row.delayHours ?? 0,
      subjectOverride: row.subject_override || row.subjectOverride || '',
      branchLabel: row.branch_label || row.branchLabel || '',
      templateId: row.template_id || row.templateId || '',
      isActive: row.is_active !== false && row.isActive !== false,
    };
  }

  // ── Step mutations ────────────────────────────────────────────────────────
  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { ...DEFAULT_STEP, stepOrder: prev.length },
    ]);
  };

  const removeStep = (index) => {
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, stepOrder: i }));
    });
  };

  const updateStep = (index, field, value) => {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = steps.map((s, i) => ({
        stepOrder: i,
        stepType: s.stepType,
        conditionType: s.conditionType,
        conditionValue: s.conditionValue || null,
        delayDays: parseInt(s.delayDays, 10) || 0,
        delayHours: parseInt(s.delayHours, 10) || 0,
        subjectOverride: s.subjectOverride || null,
        branchLabel: s.branchLabel || null,
        templateId: s.templateId || null,
        isActive: s.isActive !== false,
      }));

      await api.post(`/campaigns/${campaignId}/sequence`, { steps: payload });
      setSuccessMsg('Sequence saved successfully.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save sequence.');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-gray-500">Loading sequence...</p>
        </div>
      </div>
    );
  }

  const campaignName = campaign?.name || 'Campaign';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        to={`/campaigns/${campaignId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {campaignName}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sequence Builder</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define conditional email steps for <span className="font-medium text-gray-700">{campaignName}</span>
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-red-700"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl text-sm text-green-700"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Steps */}
      <form onSubmit={handleSave} className="space-y-4">
        {steps.map((step, index) => (
          <div key={index} className="card space-y-4">
            {/* Step header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {index + 1}
                </div>
                <StepIcon stepType={step.stepType} />
                <span className="text-sm font-semibold text-gray-800">
                  Step {index + 1}
                </span>
              </div>
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  title="Remove step"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Step type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Step Type</label>
                <select
                  value={step.stepType}
                  onChange={(e) => updateStep(index, 'stepType', e.target.value)}
                  className="select-field"
                >
                  {STEP_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Condition (relevant for condition-type steps or gating) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                <select
                  value={step.conditionType}
                  onChange={(e) => updateStep(index, 'conditionType', e.target.value)}
                  className="select-field"
                >
                  {CONDITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Delay */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Clock className="inline w-3 h-3 mr-1 text-gray-400" />
                  Delay (days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={step.delayDays}
                  onChange={(e) => updateStep(index, 'delayDays', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Clock className="inline w-3 h-3 mr-1 text-gray-400" />
                  Delay (hours)
                </label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={step.delayHours}
                  onChange={(e) => updateStep(index, 'delayHours', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            {/* Email-specific fields */}
            {step.stepType === 'email' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Mail className="inline w-3 h-3 mr-1 text-gray-400" />
                  Subject Override (leave blank to use AI-generated)
                </label>
                <input
                  type="text"
                  value={step.subjectOverride}
                  onChange={(e) => updateStep(index, 'subjectOverride', e.target.value)}
                  placeholder="e.g. Quick follow-up, {{first_name}}"
                  className="input-field"
                />
              </div>
            )}

            {/* Branch label (for condition branches) */}
            {step.stepType === 'condition' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Branch Label
                </label>
                <input
                  type="text"
                  value={step.branchLabel}
                  onChange={(e) => updateStep(index, 'branchLabel', e.target.value)}
                  placeholder="yes / no"
                  className="input-field"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Use "yes" or "no" so the engine knows which branch to take when the condition is met.
                </p>
              </div>
            )}

            {/* Connector arrow (not last step) */}
            {index < steps.length - 1 && (
              <div className="flex justify-center pt-1">
                <div className="w-0.5 h-4 bg-gray-200 rounded-full" />
              </div>
            )}
          </div>
        ))}

        {/* Add step */}
        <button
          type="button"
          onClick={addStep}
          className="w-full btn-secondary flex items-center justify-center gap-2 border-dashed"
        >
          <Plus className="w-4 h-4" />
          Add Step
        </button>

        {/* Help text */}
        <div className="card !p-4 bg-gray-50 border border-gray-200 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-700">How sequences work</p>
          <p>Steps execute in order. For each lead the scheduler evaluates the <strong>condition</strong> after the delay period has elapsed.</p>
          <p>Use <strong>Condition Branch</strong> steps with "yes"/"no" branch labels to send different emails based on lead behavior.</p>
          <p>The sequence runs once you start the campaign. Each lead progresses independently through the steps.</p>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to={`/campaigns/${campaignId}`} className="btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || steps.length === 0}
            className="btn-primary flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Sequence'}
          </button>
        </div>
      </form>
    </div>
  );
}
