import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import {
  CreditCard, TrendingUp, AlertTriangle,
  CheckCircle, ArrowUpRight, Loader2, Mail,
  Phone, Users, Palette, Crown, ExternalLink,
} from 'lucide-react';

function UsageBar({ label, icon: Icon, used, limit }) {
  const isUnlimited = limit >= 999999;
  const percentage = isUnlimited ? 0 : (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="p-4 rounded-xl" style={{
      background: 'rgba(255,255,255,0.5)',
      border: '1px solid rgba(255,255,255,0.3)',
    }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <span className={`text-sm font-semibold ${isAtLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : 'text-gray-700'}`}>
          {isUnlimited ? `${used.toLocaleString()} / Unlimited` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-brand-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <div className="flex items-center gap-1 mt-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-xs text-green-600">Unlimited</span>
        </div>
      )}
    </div>
  );
}

const HIGHLIGHTED_PLAN = 'pro';

function PlanCard({ plan, isCurrentPlan, onCheckout, busy }) {
  const isHighlighted = plan.id === HIGHLIGHTED_PLAN;
  const isEnterprise = plan.id === 'enterprise';
  const isFree = plan.id === 'free';
  const isTrial = plan.id === 'trial';

  return (
    <div className={`relative rounded-2xl p-6 transition-all flex flex-col ${isHighlighted ? 'ring-2 ring-brand-500' : ''}`} style={{
      background: isCurrentPlan
        ? 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(124,58,237,0.05))'
        : 'rgba(255,255,255,0.6)',
      border: isCurrentPlan
        ? '2px solid rgba(139,92,246,0.3)'
        : '1px solid rgba(255,255,255,0.3)',
    }}>
      {isHighlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
          Most Popular
        </div>
      )}
      <h3 className="text-lg font-bold text-gray-800 mb-1">{plan.name}</h3>
      <p className="text-2xl font-bold text-gray-900 mb-4">{plan.priceDisplay}</p>

      <ul className="space-y-2 mb-6 flex-1">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {isCurrentPlan ? (
        <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-brand-600"
          style={{ background: 'rgba(139,92,246,0.08)' }}>
          <CheckCircle className="w-4 h-4" />
          Current Plan
        </div>
      ) : isTrial || isFree ? null : isEnterprise ? (
        <a href="mailto:sales@coldaf.com?subject=Enterprise%20plan%20inquiry"
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #111827, #374151)' }}>
          <ExternalLink className="w-4 h-4" />
          Contact Sales
        </a>
      ) : (
        <button
          onClick={() => onCheckout(plan.id)}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
          style={{
            background: isHighlighted
              ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
              : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            boxShadow: isHighlighted
              ? '0 4px 20px rgba(124,58,237,0.3)'
              : '0 4px 20px rgba(37,99,235,0.2)',
          }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
          Upgrade to {plan.name}
        </button>
      )}
    </div>
  );
}

export default function BillingDashboard() {
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadData();
    // Handle post-Checkout return
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      setMessage({ type: 'success', text: 'Payment successful — your plan is being activated.' });
      searchParams.delete('checkout');
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });
    } else if (checkout === 'cancelled') {
      setMessage({ type: 'info', text: 'Checkout cancelled. No charge was made.' });
      searchParams.delete('checkout');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      const [usageRes, plansRes] = await Promise.all([
        api.get('/billing/usage'),
        api.get('/billing/plans'),
      ]);
      // ApiClient uses raw fetch — response IS the parsed JSON body (no axios .data wrapper)
      // Backend sends { data: {...} }, so res.data is the payload directly.
      setUsage(usageRes.data ?? usageRes ?? null);
      const plansPayload = plansRes.data ?? plansRes;
      setPlans(Array.isArray(plansPayload) ? plansPayload : []);
    } catch (err) {
      console.error('Failed to load billing data', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(planId) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post('/billing/checkout-session', { plan: planId });
      const url = res.data?.data?.url;
      if (url) {
        window.location.assign(url);
        return;
      }
      setMessage({ type: 'error', text: 'Could not start checkout. Please try again.' });
    } catch (err) {
      // Fall back to legacy upgrade if Stripe is not configured
      const msg = err.response?.data?.message || '';
      if (err.response?.status === 503) {
        try {
          const legacy = await api.post('/billing/upgrade', { plan: planId });
          setMessage({ type: 'success', text: legacy.data.message });
          await loadData();
        } catch (legacyErr) {
          setMessage({ type: 'error', text: legacyErr.response?.data?.message || 'Upgrade failed.' });
        }
      } else {
        setMessage({ type: 'error', text: msg || 'Failed to start checkout.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePortal() {
    setBusy(true);
    try {
      const res = await api.post('/billing/portal-session');
      const url = res.data?.data?.url;
      if (url) window.location.assign(url);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Could not open billing portal.' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const delinquent = usage?.stripe?.delinquent;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Billing & Usage</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your subscription and monitor usage</p>
        </div>
        {usage?.stripe?.status && usage.plan !== 'free' && usage.plan !== 'trial' && (
          <button
            onClick={handlePortal}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <CreditCard className="w-4 h-4" />
            Manage billing
          </button>
        )}
      </div>

      {/* Dunning banner — past_due / unpaid */}
      {delinquent && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">Your last payment failed</p>
            <p className="text-xs mt-0.5 text-red-600">
              Campaigns are paused until payment is fixed. Update your card in the billing portal to restore full access.
            </p>
          </div>
          <button onClick={handlePortal} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
            Fix payment
          </button>
        </div>
      )}

      {/* Trial banner */}
      {usage?.plan === 'trial' && usage.trialDaysRemaining !== null && !delinquent && (
        <div className={`flex items-start gap-3 p-4 rounded-xl ${usage.trialExpired
          ? 'bg-red-50 border border-red-200'
          : usage.trialDaysRemaining <= 3
            ? 'bg-amber-50 border border-amber-200'
            : 'bg-blue-50 border border-blue-200'
          }`}>
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${usage.trialExpired ? 'text-red-500' : usage.trialDaysRemaining <= 3 ? 'text-amber-500' : 'text-blue-500'}`} />
          <div>
            <p className={`text-sm font-medium ${usage.trialExpired ? 'text-red-700' : usage.trialDaysRemaining <= 3 ? 'text-amber-700' : 'text-blue-700'}`}>
              {usage.trialExpired
                ? 'Your free trial has expired'
                : `${usage.trialDaysRemaining} day${usage.trialDaysRemaining !== 1 ? 's' : ''} remaining on your trial`}
            </p>
            <p className={`text-xs mt-0.5 ${usage.trialExpired ? 'text-red-600' : usage.trialDaysRemaining <= 3 ? 'text-amber-600' : 'text-blue-600'}`}>
              {usage.trialExpired
                ? 'Your account is in read-only mode. Upgrade to continue sending emails and making calls.'
                : 'Upgrade to a paid plan to keep your account active after the trial ends.'}
            </p>
          </div>
        </div>
      )}

      {/* Status message */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${message.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : message.type === 'info'
            ? 'bg-blue-50 text-blue-700 border border-blue-200'
            : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
          {message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Current plan summary */}
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.3)',
      }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <Crown className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">{usage?.planName} Plan</h2>
              <p className="text-xs text-gray-500">
                {usage?.planStartedAt && `Since ${new Date(usage.planStartedAt).toLocaleDateString()}`}
                {usage?.stripe?.currentPeriodEnd && ` · Renews ${new Date(usage.stripe.currentPeriodEnd).toLocaleDateString()}`}
                {usage?.stripe?.cancelAtPeriodEnd && ' · Cancels at period end'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UsageBar label="Emails This Month" icon={Mail}
            used={usage?.usage?.emails?.used || 0} limit={usage?.usage?.emails?.limit || 0} />
          <UsageBar label="Phone Minutes" icon={Phone}
            used={usage?.usage?.phoneMinutes?.used || 0} limit={usage?.usage?.phoneMinutes?.limit || 0} />
          <UsageBar label="Team Members" icon={Users}
            used={usage?.usage?.users?.used || 0} limit={usage?.usage?.users?.limit || 0} />
          <UsageBar label="Brands" icon={Palette}
            used={usage?.usage?.brands?.used || 0} limit={usage?.usage?.brands?.limit || 0} />
        </div>
      </div>

      {/* Plans grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans
            .filter(p => p.id !== 'trial') // Trial shown only in its banner
            .map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={plan.id === usage?.plan}
                onCheckout={handleCheckout}
                busy={busy}
              />
            ))}
        </div>
      </div>

      {/* Usage history */}
      {usage?.history?.length > 0 && (
        <div className="rounded-2xl p-6" style={{
          background: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(255,255,255,0.3)',
        }}>
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-500" />
            Recent Usage (30 days)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Type</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {usage.history.map((h, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">{new Date(h.day).toLocaleDateString()}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: h.eventType === 'email_sent' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)',
                          color: h.eventType === 'email_sent' ? '#2563eb' : '#059669',
                        }}>
                        {h.eventType === 'email_sent' ? <Mail className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                        {h.eventType === 'email_sent' ? 'Emails' : 'Phone Minutes'}
                      </span>
                    </td>
                    <td className="py-2 text-right font-medium text-gray-700">{h.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
