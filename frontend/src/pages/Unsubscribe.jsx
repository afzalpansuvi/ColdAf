import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MailX, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState('confirming'); // confirming | success | error | already
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token || !email) {
      setStatus('error');
      setMessage('Invalid unsubscribe link. Missing required parameters.');
      return;
    }

    // Auto-submit unsubscribe on load (one-click unsubscribe per RFC 8058)
    const doUnsubscribe = async () => {
      try {
        const res = await fetch(`/api/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, email }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setStatus('success');
          setMessage(data.message || 'You have been successfully unsubscribed.');
        } else if (res.status === 409) {
          setStatus('already');
          setMessage(data.message || 'This email is already unsubscribed.');
        } else {
          setStatus('error');
          setMessage(data.message || 'Failed to process unsubscribe request.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('Network error. Please try again later.');
      }
    };

    doUnsubscribe();
  }, [token, email]);

  const icons = {
    confirming: <Loader2 className="w-16 h-16 text-brand-500 animate-spin" />,
    success: <CheckCircle className="w-16 h-16 text-green-500" />,
    already: <CheckCircle className="w-16 h-16 text-blue-500" />,
    error: <AlertCircle className="w-16 h-16 text-red-500" />,
  };

  const titles = {
    confirming: 'Processing...',
    success: 'Unsubscribed',
    already: 'Already Unsubscribed',
    error: 'Error',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="flex justify-center mb-6">
          {icons[status]}
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          {titles[status]}
        </h1>

        <p className="text-gray-600 mb-6">
          {status === 'confirming'
            ? 'Please wait while we process your request...'
            : message}
        </p>

        {status === 'success' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-green-700">
              <MailX className="w-5 h-5" />
              <span className="text-sm font-medium">
                {email} has been removed from all future emails.
              </span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <p className="text-sm text-gray-500">
            If the problem persists, please contact us directly and we will remove your email manually.
          </p>
        )}

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            This action was requested for {email || 'your email address'}.
          </p>
        </div>
      </div>
    </div>
  );
}
