import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import {
  Building2, Palette, Mail, Users, Rocket,
  CheckCircle, ArrowRight, ArrowLeft, Loader2,
  Upload, Globe, Plus, X, AlertCircle,
} from 'lucide-react';

const STEPS = [
  { id: 'org', label: 'Organization', icon: Building2, description: 'Confirm your organization details' },
  { id: 'brand', label: 'Create Brand', icon: Palette, description: 'Set up your first brand identity' },
  { id: 'smtp', label: 'Connect Email', icon: Mail, description: 'Connect your SMTP account' },
  { id: 'leads', label: 'Import Leads', icon: Users, description: 'Add your first leads' },
  { id: 'launch', label: 'Launch', icon: Rocket, description: 'Review and go live' },
];

function StepIndicator({ steps, currentIndex }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {steps.map((step, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              isCurrent
                ? 'bg-brand-50 border border-brand-200'
                : isComplete
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-gray-50 border border-gray-100'
            }`}>
              <div className={`p-1 rounded-lg ${
                isCurrent ? 'bg-brand-100' : isComplete ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                {isComplete ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Icon className={`w-4 h-4 ${isCurrent ? 'text-brand-600' : 'text-gray-400'}`} />
                )}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${
                isCurrent ? 'text-brand-700' : isComplete ? 'text-green-700' : 'text-gray-400'
              }`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-6 h-0.5 mx-1 ${isComplete ? 'bg-green-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Step 1: Organization Details
function OrgStep({ data, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
        <input
          type="text"
          value={data.orgName || ''}
          onChange={(e) => onChange({ ...data, orgName: e.target.value })}
          placeholder="Your Company Inc."
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Website (optional)</label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="url"
            value={data.website || ''}
            onChange={(e) => onChange({ ...data, website: e.target.value })}
            placeholder="https://yourcompany.com"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
      </div>
    </div>
  );
}

// Step 2: Create Brand
function BrandStep({ data, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name *</label>
        <input
          type="text"
          value={data.brandName || ''}
          onChange={(e) => onChange({ ...data, brandName: e.target.value })}
          placeholder="e.g. AtAflex Solutions"
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Brand Description</label>
        <textarea
          value={data.brandDescription || ''}
          onChange={(e) => onChange({ ...data, brandDescription: e.target.value })}
          placeholder="Brief description of your brand and what you do..."
          rows={3}
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
        <input
          type="url"
          value={data.brandWebsite || ''}
          onChange={(e) => onChange({ ...data, brandWebsite: e.target.value })}
          placeholder="https://yourbrand.com"
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

// Step 3: Connect SMTP
function SmtpStep({ data, onChange }) {
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
        <p className="text-xs text-blue-700">
          Connect your SMTP account to start sending emails. You can also set this up later from Settings.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host *</label>
          <input
            type="text"
            value={data.smtpHost || ''}
            onChange={(e) => onChange({ ...data, smtpHost: e.target.value })}
            placeholder="smtp.gmail.com"
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
          <input
            type="number"
            value={data.smtpPort || 587}
            onChange={(e) => onChange({ ...data, smtpPort: parseInt(e.target.value) || 587 })}
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
        <input
          type="email"
          value={data.smtpEmail || ''}
          onChange={(e) => onChange({ ...data, smtpEmail: e.target.value })}
          placeholder="you@company.com"
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input
          type="text"
          value={data.smtpUsername || ''}
          onChange={(e) => onChange({ ...data, smtpUsername: e.target.value })}
          placeholder="your-username or email"
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Password / App Password</label>
        <input
          type="password"
          value={data.smtpPassword || ''}
          onChange={(e) => onChange({ ...data, smtpPassword: e.target.value })}
          placeholder="Your SMTP password"
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

// Step 4: Import Leads
function LeadsStep({ data, onChange }) {
  const [manualLeads, setManualLeads] = useState(data.manualLeads || [{ name: '', email: '' }]);

  function addRow() {
    const updated = [...manualLeads, { name: '', email: '' }];
    setManualLeads(updated);
    onChange({ ...data, manualLeads: updated });
  }

  function removeRow(i) {
    const updated = manualLeads.filter((_, idx) => idx !== i);
    setManualLeads(updated);
    onChange({ ...data, manualLeads: updated });
  }

  function updateRow(i, field, value) {
    const updated = [...manualLeads];
    updated[i] = { ...updated[i], [field]: value };
    setManualLeads(updated);
    onChange({ ...data, manualLeads: updated });
  }

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
        <p className="text-xs text-blue-700">
          Add a few leads to get started. You can import from CSV or Google Sheets later.
        </p>
      </div>

      <div className="space-y-2">
        {manualLeads.map((lead, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={lead.name}
              onChange={(e) => updateRow(i, 'name', e.target.value)}
              placeholder="Full Name"
              className="flex-1 px-3 py-2 rounded-lg text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <input
              type="email"
              value={lead.email}
              onChange={(e) => updateRow(i, 'email', e.target.value)}
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 rounded-lg text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {manualLeads.length > 1 && (
              <button onClick={() => removeRow(i)} className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button onClick={addRow}
        className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium">
        <Plus className="w-4 h-4" /> Add another lead
      </button>

      <p className="text-xs text-gray-400 mt-2">
        You can skip this step and import leads later from the Leads page.
      </p>
    </div>
  );
}

// Step 5: Launch / Review
function LaunchStep({ data }) {
  const completedItems = [
    { label: 'Organization configured', done: !!data.orgName },
    { label: 'Brand created', done: !!data.brandName },
    { label: 'SMTP connected', done: !!data.smtpHost && !!data.smtpEmail },
    { label: 'Leads added', done: data.manualLeads?.some(l => l.email) },
  ];

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <h3 className="font-medium text-gray-800 mb-3">Setup Checklist</h3>
        <div className="space-y-2">
          {completedItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <CheckCircle className={`w-4 h-4 ${item.done ? 'text-green-500' : 'text-gray-300'}`} />
              <span className={`text-sm ${item.done ? 'text-gray-700' : 'text-gray-400'}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-green-50 border border-green-100">
        <p className="text-sm text-green-700 font-medium">
          You're all set! Click "Complete Setup" to finish onboarding and start using ColdAF.
        </p>
        <p className="text-xs text-green-600 mt-1">
          You can always update these settings later from the sidebar menu.
        </p>
      </div>
    </div>
  );
}

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState({
    orgName: organization?.name || '',
    website: '',
    brandName: '',
    brandDescription: '',
    brandWebsite: '',
    smtpHost: '',
    smtpPort: 587,
    smtpEmail: '',
    smtpUsername: '',
    smtpPassword: '',
    manualLeads: [{ name: '', email: '' }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const step = STEPS[currentStep];

  function canProceed() {
    switch (step.id) {
      case 'org': return !!data.orgName?.trim();
      case 'brand': return !!data.brandName?.trim();
      case 'smtp': return true; // Optional
      case 'leads': return true; // Optional
      case 'launch': return true;
      default: return true;
    }
  }

  async function handleNext() {
    if (currentStep < STEPS.length - 1) {
      // Save progress per step
      setSaving(true);
      setError('');
      try {
        if (step.id === 'org' && data.orgName) {
          await api.put('/organizations', {
            name: data.orgName,
            website: data.website || undefined,
          });
        }

        if (step.id === 'brand' && data.brandName) {
          try {
            await api.post('/brands', {
              name: data.brandName,
              description: data.brandDescription || undefined,
              website: data.brandWebsite || undefined,
            });
          } catch (err) {
            // May already exist, that's fine
            if (!err.response?.data?.message?.includes('already exists')) {
              throw err;
            }
          }
        }

        if (step.id === 'smtp' && data.smtpHost && data.smtpEmail) {
          try {
            await api.post('/smtp', {
              provider: 'smtp',
              emailAddress: data.smtpEmail,
              displayName: data.orgName || 'My SMTP',
              smtpHost: data.smtpHost,
              smtpPort: data.smtpPort,
              smtpUsername: data.smtpUsername || data.smtpEmail,
              smtpPassword: data.smtpPassword,
              useTls: true,
            });
          } catch (err) {
            if (!err.response?.data?.message?.includes('already exists')) {
              throw err;
            }
          }
        }

        if (step.id === 'leads') {
          const validLeads = (data.manualLeads || []).filter(l => l.email?.trim());
          for (const lead of validLeads) {
            try {
              await api.post('/leads', {
                email: lead.email.trim(),
                fullName: lead.name?.trim() || undefined,
              });
            } catch {
              // Skip duplicates
            }
          }
        }

        // Save onboarding progress
        await api.put('/organizations', {
          onboardingState: { currentStep: currentStep + 1, completedSteps: STEPS.slice(0, currentStep + 1).map(s => s.id) },
        });
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to save. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
      setCurrentStep(currentStep + 1);
    }
  }

  async function handleComplete() {
    setSaving(true);
    setError('');
    try {
      await api.put('/organizations', {
        onboardingState: { completed: true, completedAt: new Date().toISOString() },
      });
      navigate('/');
    } catch (err) {
      setError('Failed to complete onboarding. Please try again.');
    }
    setSaving(false);
  }

  const StepIcon = step.icon;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{
      background: 'linear-gradient(135deg, #e8e4fd 0%, #ddd6fe 30%, #e0e7ff 60%, #ede9fe 100%)',
    }}>
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src="/ataflex-logo.svg" alt="ColdAF" className="w-12 h-12 mb-2" />
          <h1 className="text-xl font-bold text-gray-800">Set Up Your Account</h1>
          <p className="text-sm text-gray-500">Let's get you started in just a few steps</p>
        </div>

        <StepIndicator steps={STEPS} currentIndex={currentStep} />

        {/* Card */}
        <div className="rounded-2xl p-8" style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.4)',
          boxShadow: '0 12px 50px rgba(124,58,237,0.08)',
        }}>
          {/* Step Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <StepIcon className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{step.label}</h2>
              <p className="text-sm text-gray-500">{step.description}</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step Content */}
          {step.id === 'org' && <OrgStep data={data} onChange={setData} />}
          {step.id === 'brand' && <BrandStep data={data} onChange={setData} />}
          {step.id === 'smtp' && <SmtpStep data={data} onChange={setData} />}
          {step.id === 'leads' && <LeadsStep data={data} onChange={setData} />}
          {step.id === 'launch' && <LaunchStep data={data} />}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0 || saving}
              className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="flex items-center gap-2">
              {step.id !== 'launch' && step.id !== 'org' && (
                <button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Skip
                </button>
              )}

              {step.id === 'launch' ? (
                <button
                  onClick={handleComplete}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
                  }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  Complete Setup
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={!canProceed() || saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
                  }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Step {currentStep + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
