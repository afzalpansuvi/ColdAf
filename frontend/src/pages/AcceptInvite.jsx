import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { Loader2, AlertCircle, CheckCircle, User, Lock } from 'lucide-react';

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { fetchUser } = useAuth();

  const [step, setStep] = useState('loading'); // loading, form, success, error
  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState({ fullName: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Validate the token on mount
    const validateToken = async () => {
      try {
        const { data } = await api.get(`/auth/invite/${token}`);
        if (data.success) {
          setInvite(data.data);
          setStep('form');
        } else {
          setError(data.message || 'Invalid or expired invitation.');
          setStep('error');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Invalid or expired invitation link.');
        setStep('error');
      }
    };
    if (token) validateToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim() || !form.password.trim()) {
      setError('Full name and password are required.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/accept-invitation', {
        token,
        fullName: form.fullName,
        password: form.password,
      });
      setStep('success');
      // Auto-login: refresh user context after a brief delay
      setTimeout(async () => {
        await fetchUser();
        navigate('/', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.35)',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{
      background: 'linear-gradient(135deg, #e8e4fd 0%, #ddd6fe 30%, #e0e7ff 60%, #ede9fe 100%)',
    }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(139, 92, 246, 0.15)' }} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(59, 130, 246, 0.1)' }} />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="rounded-3xl p-8" style={{
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 12px 50px rgba(124, 58, 237, 0.08)',
        }}>
          {step === 'loading' && (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-4" />
              <p className="text-sm text-gray-500">Validating invitation...</p>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{
                background: 'rgba(239, 68, 68, 0.1)',
              }}>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Invalid Invitation</h2>
              <p className="text-sm text-gray-500 text-center mb-6">{error}</p>
              <Link to="/login" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Go to Login
              </Link>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{
                background: 'rgba(34, 197, 94, 0.1)',
              }}>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Welcome aboard!</h2>
              <p className="text-sm text-gray-500 text-center">
                Your account has been created. Redirecting to dashboard...
              </p>
            </div>
          )}

          {step === 'form' && (
            <>
              <div className="flex flex-col items-center mb-8">
                <img src="/ataflex-logo.svg" alt="AtAflex Solutions" className="w-14 h-14 mb-4" />
                <h1 className="text-2xl font-bold text-gray-800">Join {invite?.organizationName}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  You've been invited as <span className="font-medium text-brand-600">{invite?.role}</span>
                </p>
              </div>

              {error && (
                <div className="mb-6 flex items-start gap-3 p-3 rounded-xl" style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                }}>
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="w-4 h-4 text-gray-400" />
                    </div>
                    <input type="text" value={form.fullName}
                      onChange={(e) => setForm(p => ({ ...p, fullName: e.target.value }))}
                      placeholder="Your full name" autoFocus
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400"
                      style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="w-4 h-4 text-gray-400" />
                    </div>
                    <input type="password" value={form.password}
                      onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Min. 8 characters" autoComplete="new-password"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400"
                      style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="w-4 h-4 text-gray-400" />
                    </div>
                    <input type="password" value={form.confirmPassword}
                      onChange={(e) => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="Re-enter password" autoComplete="new-password"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400"
                      style={inputStyle} />
                  </div>
                </div>

                <button type="submit" disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    boxShadow: '0 4px 20px rgba(124, 58, 237, 0.35)',
                  }}>
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>
                  ) : (
                    'Accept Invitation & Join'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
