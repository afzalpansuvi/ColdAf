import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Loader2, AlertCircle, Mail, Lock, User, Building2 } from 'lucide-react';

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    companyName: '',
    reason: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.email.trim() || !form.password.trim() || !form.fullName.trim()) {
      setError('Email, password, and full name are required.');
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

    setLoading(true);
    try {
      await api.post('/auth/signup/super-admin', {
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        companyName: form.companyName,
        reason: form.reason,
      });
      navigate('/pending-approval');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.35)',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{
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
          <div className="flex flex-col items-center mb-8">
            <img src="/ataflex-logo.svg" alt="AtAflex Solutions" className="w-14 h-14 mb-4" />
            <h1 className="text-2xl font-bold text-gray-800">Create Account</h1>
            <p className="text-sm text-gray-500 mt-1">Sign up to the next generation of Cold Email/Calling System</p>
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
                <input type="text" value={form.fullName} onChange={update('fullName')}
                  placeholder="John Doe" autoFocus
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400"
                  style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="w-4 h-4 text-gray-400" />
                </div>
                <input type="email" value={form.email} onChange={update('email')}
                  placeholder="you@company.com" autoComplete="email"
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
                <input type="password" value={form.password} onChange={update('password')}
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
                <input type="password" value={form.confirmPassword} onChange={update('confirmPassword')}
                  placeholder="Re-enter password" autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400"
                  style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Building2 className="w-4 h-4 text-gray-400" />
                </div>
                <input type="text" value={form.companyName} onChange={update('companyName')}
                  placeholder="Your company"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400"
                  style={inputStyle} />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                boxShadow: '0 4px 20px rgba(124, 58, 237, 0.35)',
              }}>
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
