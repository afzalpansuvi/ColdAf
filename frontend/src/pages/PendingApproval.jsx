import { Link } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';

export default function PendingApproval() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{
      background: 'linear-gradient(135deg, #e8e4fd 0%, #ddd6fe 30%, #e0e7ff 60%, #ede9fe 100%)',
    }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(139, 92, 246, 0.15)' }} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(59, 130, 246, 0.1)' }} />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="rounded-3xl p-8 text-center" style={{
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 12px 50px rgba(124, 58, 237, 0.08)',
        }}>
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.15))',
            }}>
              <Clock className="w-10 h-10 text-amber-500" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-800 mb-3">Account Pending Approval</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Your account has been created successfully. A platform administrator will review and approve your request.
            You'll receive an email notification once your account is activated.
          </p>

          <div className="rounded-xl p-4 mb-6" style={{
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
          }}>
            <p className="text-sm text-amber-700 font-medium">What happens next?</p>
            <ul className="text-xs text-amber-600 mt-2 space-y-1.5 text-left pl-4">
              <li className="list-disc">The platform owner will review your application</li>
              <li className="list-disc">Upon approval, you can log in and create organizations</li>
              <li className="list-disc">You'll be able to invite team members and set up campaigns</li>
            </ul>
          </div>

          <Link to="/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
